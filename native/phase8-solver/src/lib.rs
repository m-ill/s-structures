use std::alloc::{alloc, dealloc, Layout};
use std::mem::{align_of, size_of};
use std::slice;

const ABI_VERSION: u32 = 1;
const MATRIX_CLASS_SPD: u32 = 0;
const MATRIX_CLASS_GENERAL: u32 = 1;
const DIAGNOSTICS_LEN: usize = 14;

const STATUS_OK: u32 = 0;
const STATUS_INVALID_DIMENSIONS: u32 = 1;
const STATUS_INVALID_CSR: u32 = 2;
const STATUS_NONFINITE_INPUT: u32 = 3;
const STATUS_SINGULAR_PIVOT: u32 = 4;
const STATUS_NON_POSITIVE_CURVATURE: u32 = 5;
const STATUS_MAX_ITERATIONS: u32 = 6;
const STATUS_NONFINITE_SOLUTION: u32 = 7;
const STATUS_RESIDUAL_TOLERANCE: u32 = 8;
const STATUS_INVALID_OPTIONS: u32 = 9;

#[derive(Clone, Copy)]
struct Entry {
    column: usize,
    value: f64,
}

struct Diagnostics {
    status: u32,
    iterations: usize,
    residual_norm: f64,
    relative_residual: f64,
    residual_max: f64,
    rhs_norm: f64,
    matrix_norm: f64,
    pivot_min: f64,
    pivot_max: f64,
    pivot_ratio: f64,
    factor_nonzeros: usize,
    fill_in_count: usize,
    failure_index: f64,
    finite: bool,
}

impl Diagnostics {
    fn new() -> Self {
        Self {
            status: STATUS_INVALID_DIMENSIONS,
            iterations: 0,
            residual_norm: f64::NAN,
            relative_residual: f64::NAN,
            residual_max: f64::NAN,
            rhs_norm: f64::NAN,
            matrix_norm: f64::NAN,
            pivot_min: 0.0,
            pivot_max: 0.0,
            pivot_ratio: 0.0,
            factor_nonzeros: 0,
            fill_in_count: 0,
            failure_index: -1.0,
            finite: false,
        }
    }

    fn update_pivot_ratio(&mut self) {
        self.pivot_ratio = if self.pivot_max > 0.0 {
            self.pivot_min / self.pivot_max
        } else {
            0.0
        };
    }
}

struct NormAccumulator {
    scale: f64,
    scaled_squares: f64,
}

impl NormAccumulator {
    fn new() -> Self {
        Self {
            scale: 0.0,
            scaled_squares: 1.0,
        }
    }

    fn add(&mut self, value: f64) {
        let magnitude = value.abs();
        if magnitude == 0.0 {
            return;
        }
        if self.scale < magnitude {
            let ratio = self.scale / magnitude;
            self.scaled_squares = 1.0 + self.scaled_squares * ratio * ratio;
            self.scale = magnitude;
        } else {
            let ratio = magnitude / self.scale;
            self.scaled_squares += ratio * ratio;
        }
    }

    fn finish(&self) -> f64 {
        if self.scale == 0.0 {
            0.0
        } else {
            self.scale * self.scaled_squares.sqrt()
        }
    }
}

#[no_mangle]
pub extern "C" fn p8_solver_abi_version() -> u32 {
    ABI_VERSION
}

#[no_mangle]
pub extern "C" fn p8_solver_capabilities() -> u32 {
    // Bit 0: SPD CG, bit 1: general sparse LU, bit 2: CSR input.
    0b111
}

#[no_mangle]
pub extern "C" fn p8_diagnostics_len() -> u32 {
    DIAGNOSTICS_LEN as u32
}

#[no_mangle]
pub extern "C" fn p8_alloc(size: u32, alignment: u32) -> u32 {
    let size = (size as usize).max(1);
    let alignment = alignment as usize;
    let Ok(layout) = Layout::from_size_align(size, alignment) else {
        return 0;
    };
    unsafe { alloc(layout) as u32 }
}

#[no_mangle]
pub extern "C" fn p8_dealloc(pointer: u32, size: u32, alignment: u32) {
    if pointer == 0 {
        return;
    }
    let size = (size as usize).max(1);
    let alignment = alignment as usize;
    if let Ok(layout) = Layout::from_size_align(size, alignment) {
        unsafe { dealloc(pointer as *mut u8, layout) };
    }
}

#[no_mangle]
/// Solves a square canonical CSR system through the Phase 8 pointer ABI.
///
/// # Safety
///
/// Every pointer must reference an aligned allocation in this module's linear memory. The input
/// allocations must cover the lengths declared by `dimension` and `nonzeros`; `solution` must
/// cover `dimension` f64 values and `diagnostics_output` must cover `p8_diagnostics_len()` values.
pub unsafe extern "C" fn p8_solve_csr(
    matrix_class: u32,
    dimension: u32,
    nonzeros: u32,
    row_pointer: *const u32,
    column_index: *const u32,
    values: *const f64,
    rhs: *const f64,
    solution: *mut f64,
    pivot_tolerance: f64,
    relative_tolerance: f64,
    max_iterations: u32,
    diagnostics_output: *mut f64,
) -> u32 {
    if diagnostics_output.is_null()
        || !(diagnostics_output as usize).is_multiple_of(align_of::<f64>())
    {
        return STATUS_INVALID_CSR;
    }

    let mut diagnostics = Diagnostics::new();
    let status = unsafe {
        solve_checked(
            matrix_class,
            dimension as usize,
            nonzeros as usize,
            row_pointer,
            column_index,
            values,
            rhs,
            solution,
            pivot_tolerance,
            relative_tolerance,
            max_iterations as usize,
            &mut diagnostics,
        )
    };
    diagnostics.status = status;
    unsafe { write_diagnostics(diagnostics_output, &diagnostics) };
    status
}

#[allow(clippy::too_many_arguments)]
unsafe fn solve_checked(
    matrix_class: u32,
    dimension: usize,
    nonzeros: usize,
    row_pointer: *const u32,
    column_index: *const u32,
    values: *const f64,
    rhs: *const f64,
    solution: *mut f64,
    pivot_tolerance: f64,
    relative_tolerance: f64,
    max_iterations: usize,
    diagnostics: &mut Diagnostics,
) -> u32 {
    if dimension == 0 || dimension > u32::MAX as usize - 1 || nonzeros > u32::MAX as usize {
        return STATUS_INVALID_DIMENSIONS;
    }
    if matrix_class != MATRIX_CLASS_SPD && matrix_class != MATRIX_CLASS_GENERAL {
        return STATUS_INVALID_OPTIONS;
    }
    if !pivot_tolerance.is_finite()
        || pivot_tolerance <= 0.0
        || pivot_tolerance > 1.0
        || !relative_tolerance.is_finite()
        || relative_tolerance <= 0.0
        || relative_tolerance > 1.0
        || max_iterations == 0
    {
        return STATUS_INVALID_OPTIONS;
    }
    if row_pointer.is_null()
        || column_index.is_null()
        || values.is_null()
        || rhs.is_null()
        || solution.is_null()
        || !(row_pointer as usize).is_multiple_of(align_of::<u32>())
        || !(column_index as usize).is_multiple_of(align_of::<u32>())
        || !(values as usize).is_multiple_of(align_of::<f64>())
        || !(rhs as usize).is_multiple_of(align_of::<f64>())
        || !(solution as usize).is_multiple_of(align_of::<f64>())
    {
        return STATUS_INVALID_CSR;
    }

    let row_pointer = slice::from_raw_parts(row_pointer, dimension + 1);
    let column_index = slice::from_raw_parts(column_index, nonzeros);
    let values = slice::from_raw_parts(values, nonzeros);
    let rhs = slice::from_raw_parts(rhs, dimension);
    let solution = slice::from_raw_parts_mut(solution, dimension);
    solution.fill(0.0);

    if !validate_csr(dimension, nonzeros, row_pointer, column_index) {
        return STATUS_INVALID_CSR;
    }
    if values.iter().any(|value| !value.is_finite()) || rhs.iter().any(|value| !value.is_finite()) {
        return STATUS_NONFINITE_INPUT;
    }

    diagnostics.finite = true;
    diagnostics.rhs_norm = stable_norm(rhs);
    if !diagnostics.rhs_norm.is_finite() {
        diagnostics.finite = false;
        return STATUS_NONFINITE_INPUT;
    }
    diagnostics.matrix_norm = match matrix_infinity_norm(row_pointer, values) {
        Some(value) => value,
        None => {
            diagnostics.finite = false;
            return STATUS_NONFINITE_INPUT;
        }
    };

    if matrix_class == MATRIX_CLASS_SPD {
        solve_cg(
            dimension,
            row_pointer,
            column_index,
            values,
            rhs,
            solution,
            pivot_tolerance,
            relative_tolerance,
            max_iterations,
            diagnostics,
        )
    } else {
        solve_sparse_lu(
            dimension,
            row_pointer,
            column_index,
            values,
            rhs,
            solution,
            pivot_tolerance,
            relative_tolerance,
            diagnostics,
        )
    }
}

fn validate_csr(
    dimension: usize,
    nonzeros: usize,
    row_pointer: &[u32],
    column_index: &[u32],
) -> bool {
    if row_pointer[0] != 0 || row_pointer[dimension] as usize != nonzeros {
        return false;
    }
    for row in 0..dimension {
        let start = row_pointer[row] as usize;
        let end = row_pointer[row + 1] as usize;
        if start > end || end > nonzeros {
            return false;
        }
        let mut previous = None;
        for &column in &column_index[start..end] {
            let column = column as usize;
            if column >= dimension || previous.is_some_and(|value| column <= value) {
                return false;
            }
            previous = Some(column);
        }
    }
    true
}

#[allow(clippy::too_many_arguments)]
fn solve_cg(
    dimension: usize,
    row_pointer: &[u32],
    column_index: &[u32],
    values: &[f64],
    rhs: &[f64],
    solution: &mut [f64],
    pivot_tolerance: f64,
    relative_tolerance: f64,
    max_iterations: usize,
    diagnostics: &mut Diagnostics,
) -> u32 {
    let pivot_scale = diagnostics.matrix_norm.max(f64::MIN_POSITIVE);
    let pivot_threshold = pivot_tolerance * pivot_scale;
    let mut diagonal = vec![0.0; dimension];
    diagnostics.pivot_min = f64::INFINITY;

    for row in 0..dimension {
        let start = row_pointer[row] as usize;
        let end = row_pointer[row + 1] as usize;
        if let Ok(offset) = column_index[start..end].binary_search(&(row as u32)) {
            diagonal[row] = values[start + offset];
        }
        let diagonal_value = diagonal[row];
        if diagonal_value <= pivot_threshold {
            diagnostics.failure_index = row as f64;
            diagnostics.pivot_min = diagnostics.pivot_min.min(diagonal_value.abs());
            diagnostics.pivot_max = diagnostics.pivot_max.max(diagonal_value.abs());
            diagnostics.update_pivot_ratio();
            return STATUS_NON_POSITIVE_CURVATURE;
        }
        diagnostics.pivot_min = diagnostics.pivot_min.min(diagonal_value);
        diagnostics.pivot_max = diagnostics.pivot_max.max(diagonal_value);
    }
    diagnostics.update_pivot_ratio();

    if diagnostics.rhs_norm == 0.0 {
        set_residual_diagnostics(diagnostics, 0.0, 0.0);
        return STATUS_OK;
    }

    let mut residual = rhs.to_vec();
    let mut preconditioned = vec![0.0; dimension];
    let mut direction = vec![0.0; dimension];
    let mut product = vec![0.0; dimension];
    for index in 0..dimension {
        preconditioned[index] = residual[index] / diagonal[index];
        direction[index] = preconditioned[index];
    }
    let mut residual_preconditioned = dot(&residual, &preconditioned);
    if !residual_preconditioned.is_finite() || residual_preconditioned <= 0.0 {
        diagnostics.finite = residual_preconditioned.is_finite();
        return if diagnostics.finite {
            STATUS_NON_POSITIVE_CURVATURE
        } else {
            STATUS_NONFINITE_SOLUTION
        };
    }

    let convergence_threshold = relative_tolerance * diagnostics.rhs_norm;
    let mut recursive_norm = stable_norm(&residual);
    while diagnostics.iterations < max_iterations && recursive_norm > convergence_threshold {
        csr_matvec(row_pointer, column_index, values, &direction, &mut product);
        let denominator = dot(&direction, &product);
        let direction_norm_squared = dot(&direction, &direction);
        let curvature_threshold = pivot_tolerance
            * diagnostics.matrix_norm.max(f64::MIN_POSITIVE)
            * direction_norm_squared.max(f64::MIN_POSITIVE);
        if !denominator.is_finite() || !direction_norm_squared.is_finite() {
            diagnostics.finite = false;
            return finish_residual(
                STATUS_NONFINITE_SOLUTION,
                row_pointer,
                column_index,
                values,
                rhs,
                solution,
                diagnostics,
            );
        }
        if denominator <= curvature_threshold {
            diagnostics.failure_index = diagnostics.iterations as f64;
            return finish_residual(
                STATUS_NON_POSITIVE_CURVATURE,
                row_pointer,
                column_index,
                values,
                rhs,
                solution,
                diagnostics,
            );
        }

        let alpha = residual_preconditioned / denominator;
        if !alpha.is_finite() {
            diagnostics.finite = false;
            return finish_residual(
                STATUS_NONFINITE_SOLUTION,
                row_pointer,
                column_index,
                values,
                rhs,
                solution,
                diagnostics,
            );
        }
        for index in 0..dimension {
            solution[index] += alpha * direction[index];
            residual[index] -= alpha * product[index];
        }
        diagnostics.iterations += 1;
        if solution.iter().any(|value| !value.is_finite())
            || residual.iter().any(|value| !value.is_finite())
        {
            diagnostics.finite = false;
            return finish_residual(
                STATUS_NONFINITE_SOLUTION,
                row_pointer,
                column_index,
                values,
                rhs,
                solution,
                diagnostics,
            );
        }

        recursive_norm = stable_norm(&residual);
        if recursive_norm <= convergence_threshold {
            break;
        }
        for index in 0..dimension {
            preconditioned[index] = residual[index] / diagonal[index];
        }
        let next_residual_preconditioned = dot(&residual, &preconditioned);
        if !next_residual_preconditioned.is_finite() || next_residual_preconditioned <= 0.0 {
            diagnostics.finite = next_residual_preconditioned.is_finite();
            return finish_residual(
                if diagnostics.finite {
                    STATUS_NON_POSITIVE_CURVATURE
                } else {
                    STATUS_NONFINITE_SOLUTION
                },
                row_pointer,
                column_index,
                values,
                rhs,
                solution,
                diagnostics,
            );
        }
        let beta = next_residual_preconditioned / residual_preconditioned;
        if !beta.is_finite() {
            diagnostics.finite = false;
            return finish_residual(
                STATUS_NONFINITE_SOLUTION,
                row_pointer,
                column_index,
                values,
                rhs,
                solution,
                diagnostics,
            );
        }
        for index in 0..dimension {
            direction[index] = preconditioned[index] + beta * direction[index];
        }
        residual_preconditioned = next_residual_preconditioned;
    }

    let provisional_status =
        if diagnostics.iterations >= max_iterations && recursive_norm > convergence_threshold {
            STATUS_MAX_ITERATIONS
        } else {
            STATUS_OK
        };
    let status = finish_residual(
        provisional_status,
        row_pointer,
        column_index,
        values,
        rhs,
        solution,
        diagnostics,
    );
    if status == STATUS_OK && diagnostics.relative_residual > relative_tolerance {
        STATUS_RESIDUAL_TOLERANCE
    } else {
        status
    }
}

#[allow(clippy::too_many_arguments)]
fn solve_sparse_lu(
    dimension: usize,
    row_pointer: &[u32],
    column_index: &[u32],
    values: &[f64],
    rhs: &[f64],
    solution: &mut [f64],
    pivot_tolerance: f64,
    relative_tolerance: f64,
    diagnostics: &mut Diagnostics,
) -> u32 {
    let mut rows = Vec::with_capacity(dimension);
    for row in 0..dimension {
        let start = row_pointer[row] as usize;
        let end = row_pointer[row + 1] as usize;
        let mut entries = Vec::with_capacity(end - start);
        for offset in start..end {
            if values[offset] != 0.0 {
                entries.push(Entry {
                    column: column_index[offset] as usize,
                    value: values[offset],
                });
            }
        }
        rows.push(entries);
    }
    let mut transformed_rhs = rhs.to_vec();
    let pivot_threshold = pivot_tolerance * diagnostics.matrix_norm.max(f64::MIN_POSITIVE);
    diagnostics.pivot_min = f64::INFINITY;

    for pivot_column in 0..dimension {
        let mut pivot_row = pivot_column;
        let mut pivot_magnitude = 0.0;
        for (candidate, row) in rows.iter().enumerate().skip(pivot_column) {
            let magnitude = entry_value(row, pivot_column).abs();
            if magnitude > pivot_magnitude {
                pivot_magnitude = magnitude;
                pivot_row = candidate;
            }
        }
        diagnostics.pivot_min = diagnostics.pivot_min.min(pivot_magnitude);
        diagnostics.pivot_max = diagnostics.pivot_max.max(pivot_magnitude);
        diagnostics.update_pivot_ratio();
        if !pivot_magnitude.is_finite() {
            diagnostics.finite = false;
            diagnostics.failure_index = pivot_column as f64;
            return STATUS_NONFINITE_SOLUTION;
        }
        if pivot_magnitude <= pivot_threshold {
            diagnostics.failure_index = pivot_column as f64;
            diagnostics.factor_nonzeros = sparse_entry_count(&rows);
            return STATUS_SINGULAR_PIVOT;
        }
        if pivot_row != pivot_column {
            rows.swap(pivot_row, pivot_column);
            transformed_rhs.swap(pivot_row, pivot_column);
        }

        let pivot_value = entry_value(&rows[pivot_column], pivot_column);
        let pivot_rhs = transformed_rhs[pivot_column];
        let (factorized_rows, trailing_rows) = rows.split_at_mut(pivot_column + 1);
        let pivot_entries = &factorized_rows[pivot_column];
        let (_, trailing_rhs) = transformed_rhs.split_at_mut(pivot_column + 1);
        for (row, row_rhs) in trailing_rows.iter_mut().zip(trailing_rhs.iter_mut()) {
            let column_value = entry_value(row, pivot_column);
            if column_value == 0.0 {
                continue;
            }
            let multiplier = column_value / pivot_value;
            if !multiplier.is_finite() {
                diagnostics.finite = false;
                diagnostics.failure_index = pivot_column as f64;
                return STATUS_NONFINITE_SOLUTION;
            }
            let Some(new_fill) = eliminate_row(row, pivot_entries, pivot_column, multiplier) else {
                diagnostics.finite = false;
                diagnostics.failure_index = pivot_column as f64;
                return STATUS_NONFINITE_SOLUTION;
            };
            diagnostics.fill_in_count += new_fill;
            *row_rhs -= multiplier * pivot_rhs;
            if !row_rhs.is_finite() {
                diagnostics.finite = false;
                diagnostics.failure_index = pivot_column as f64;
                return STATUS_NONFINITE_SOLUTION;
            }
        }
        diagnostics.iterations = pivot_column + 1;
    }

    diagnostics.factor_nonzeros = sparse_entry_count(&rows);
    for row_index in (0..dimension).rev() {
        let mut sum = transformed_rhs[row_index];
        let mut diagonal = 0.0;
        for entry in &rows[row_index] {
            if entry.column == row_index {
                diagonal = entry.value;
            } else if entry.column > row_index {
                sum -= entry.value * solution[entry.column];
            }
        }
        if !sum.is_finite() || !diagonal.is_finite() {
            diagnostics.finite = false;
            diagnostics.failure_index = row_index as f64;
            return STATUS_NONFINITE_SOLUTION;
        }
        if diagonal.abs() <= pivot_threshold {
            diagnostics.failure_index = row_index as f64;
            return STATUS_SINGULAR_PIVOT;
        }
        solution[row_index] = sum / diagonal;
        if !solution[row_index].is_finite() {
            diagnostics.finite = false;
            diagnostics.failure_index = row_index as f64;
            return STATUS_NONFINITE_SOLUTION;
        }
    }

    let status = finish_residual(
        STATUS_OK,
        row_pointer,
        column_index,
        values,
        rhs,
        solution,
        diagnostics,
    );
    if status == STATUS_OK && diagnostics.relative_residual > relative_tolerance {
        STATUS_RESIDUAL_TOLERANCE
    } else {
        status
    }
}

fn eliminate_row(
    row: &mut Vec<Entry>,
    pivot_row: &[Entry],
    pivot_column: usize,
    multiplier: f64,
) -> Option<usize> {
    let row_start = row.partition_point(|entry| entry.column <= pivot_column);
    let pivot_start = pivot_row.partition_point(|entry| entry.column <= pivot_column);
    let row_tail = &row[row_start..];
    let pivot_tail = &pivot_row[pivot_start..];
    let mut output = Vec::with_capacity(row_tail.len() + pivot_tail.len());
    let mut row_index = 0;
    let mut pivot_index = 0;
    let mut fill_in_count = 0;

    while row_index < row_tail.len() || pivot_index < pivot_tail.len() {
        let entry = if pivot_index >= pivot_tail.len()
            || (row_index < row_tail.len()
                && row_tail[row_index].column < pivot_tail[pivot_index].column)
        {
            let entry = row_tail[row_index];
            row_index += 1;
            entry
        } else if row_index >= row_tail.len()
            || pivot_tail[pivot_index].column < row_tail[row_index].column
        {
            let pivot_entry = pivot_tail[pivot_index];
            pivot_index += 1;
            let value = -multiplier * pivot_entry.value;
            if value != 0.0 {
                fill_in_count += 1;
            }
            Entry {
                column: pivot_entry.column,
                value,
            }
        } else {
            let original = row_tail[row_index];
            let pivot_entry = pivot_tail[pivot_index];
            row_index += 1;
            pivot_index += 1;
            Entry {
                column: original.column,
                value: original.value - multiplier * pivot_entry.value,
            }
        };
        if !entry.value.is_finite() {
            return None;
        }
        if entry.value != 0.0 {
            output.push(entry);
        }
    }
    *row = output;
    Some(fill_in_count)
}

fn entry_value(row: &[Entry], column: usize) -> f64 {
    row.binary_search_by_key(&column, |entry| entry.column)
        .map(|index| row[index].value)
        .unwrap_or(0.0)
}

fn sparse_entry_count(rows: &[Vec<Entry>]) -> usize {
    rows.iter().map(Vec::len).sum()
}

fn csr_matvec(
    row_pointer: &[u32],
    column_index: &[u32],
    values: &[f64],
    vector: &[f64],
    output: &mut [f64],
) {
    for row in 0..output.len() {
        let mut sum = 0.0;
        for offset in row_pointer[row] as usize..row_pointer[row + 1] as usize {
            sum += values[offset] * vector[column_index[offset] as usize];
        }
        output[row] = sum;
    }
}

fn dot(left: &[f64], right: &[f64]) -> f64 {
    left.iter()
        .zip(right)
        .fold(0.0, |sum, (left, right)| sum + left * right)
}

fn stable_norm(values: &[f64]) -> f64 {
    let mut accumulator = NormAccumulator::new();
    for value in values {
        accumulator.add(*value);
    }
    accumulator.finish()
}

fn matrix_infinity_norm(row_pointer: &[u32], values: &[f64]) -> Option<f64> {
    let mut matrix_norm: f64 = 0.0;
    for row in 0..row_pointer.len() - 1 {
        let mut row_sum = 0.0;
        for value in &values[row_pointer[row] as usize..row_pointer[row + 1] as usize] {
            row_sum += value.abs();
        }
        if !row_sum.is_finite() {
            return None;
        }
        matrix_norm = matrix_norm.max(row_sum);
    }
    Some(matrix_norm)
}

fn finish_residual(
    provisional_status: u32,
    row_pointer: &[u32],
    column_index: &[u32],
    values: &[f64],
    rhs: &[f64],
    solution: &[f64],
    diagnostics: &mut Diagnostics,
) -> u32 {
    let Some((residual_norm, residual_max)) =
        residual_metrics(row_pointer, column_index, values, rhs, solution)
    else {
        diagnostics.finite = false;
        return STATUS_NONFINITE_SOLUTION;
    };
    set_residual_diagnostics(diagnostics, residual_norm, residual_max);
    provisional_status
}

fn residual_metrics(
    row_pointer: &[u32],
    column_index: &[u32],
    values: &[f64],
    rhs: &[f64],
    solution: &[f64],
) -> Option<(f64, f64)> {
    let mut norm = NormAccumulator::new();
    let mut maximum: f64 = 0.0;
    for row in 0..rhs.len() {
        let mut product = 0.0;
        for offset in row_pointer[row] as usize..row_pointer[row + 1] as usize {
            product += values[offset] * solution[column_index[offset] as usize];
        }
        let residual = product - rhs[row];
        if !residual.is_finite() {
            return None;
        }
        norm.add(residual);
        maximum = maximum.max(residual.abs());
    }
    Some((norm.finish(), maximum))
}

fn set_residual_diagnostics(diagnostics: &mut Diagnostics, residual_norm: f64, residual_max: f64) {
    diagnostics.residual_norm = residual_norm;
    diagnostics.residual_max = residual_max;
    diagnostics.relative_residual = if diagnostics.rhs_norm > 0.0 {
        residual_norm / diagnostics.rhs_norm
    } else if residual_norm == 0.0 {
        0.0
    } else {
        f64::INFINITY
    };
}

unsafe fn write_diagnostics(output: *mut f64, diagnostics: &Diagnostics) {
    debug_assert_eq!(size_of::<f64>(), 8);
    let output = slice::from_raw_parts_mut(output, DIAGNOSTICS_LEN);
    output[0] = diagnostics.status as f64;
    output[1] = diagnostics.iterations as f64;
    output[2] = diagnostics.residual_norm;
    output[3] = diagnostics.relative_residual;
    output[4] = diagnostics.residual_max;
    output[5] = diagnostics.rhs_norm;
    output[6] = diagnostics.matrix_norm;
    output[7] = if diagnostics.pivot_min.is_finite() {
        diagnostics.pivot_min
    } else {
        0.0
    };
    output[8] = diagnostics.pivot_max;
    output[9] = diagnostics.pivot_ratio;
    output[10] = diagnostics.factor_nonzeros as f64;
    output[11] = diagnostics.fill_in_count as f64;
    output[12] = diagnostics.failure_index;
    output[13] = if diagnostics.finite { 1.0 } else { 0.0 };
}
