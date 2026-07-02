export const EVIDENCE_CLIENT_VERSION = 'p3-evidence-client-v3';

export function createEvidenceClient(api) {
  return {
    version: EVIDENCE_CLIENT_VERSION,

    async listProjectEvidence(projectId) {
      const result = await api.get(`/api/projects/${encodeURIComponent(projectId)}/evidence`);
      return {
        evidence: result.evidence || [],
        finalApprovals: result.finalApprovals || {},
        register: result.register,
      };
    },

    async submitProjectEvidence(projectId, evidence) {
      const result = await api.post(`/api/projects/${encodeURIComponent(projectId)}/evidence`, {
        body: { evidence },
      });
      return {
        evidence: result.evidence,
        finalApprovals: result.finalApprovals || {},
        register: result.register,
      };
    },

    async submitProjectEvidencePackage(projectId, input = {}) {
      const file = input.file || null;
      if (!file) return this.submitProjectEvidence(projectId, input.evidence || input);
      const fileResult = await api.post(`/api/projects/${encodeURIComponent(projectId)}/files`, {
        raw: await readFilePayload(file),
        headers: {
          'x-file-name': encodeURIComponent(file.name || file.originalName || 'evidence.dat'),
          'content-type': file.contentType || file.type || 'application/octet-stream',
        },
      });
      const evidence = {
        ...(input.evidence || {}),
        fileId: fileResult.file.id,
      };
      const submitted = await this.submitProjectEvidence(projectId, evidence);
      return {
        ...submitted,
        file: fileResult.file,
      };
    },
  };
}

async function readFilePayload(file) {
  if (file.raw != null) return file.raw;
  if (file.buffer != null) return file.buffer;
  if (file.text != null && typeof file.text === 'function') return file.text();
  if (file.arrayBuffer != null && typeof file.arrayBuffer === 'function') return file.arrayBuffer();
  if (file.content != null) return file.content;
  return '';
}
