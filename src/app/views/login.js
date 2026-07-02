import { buildHash } from '../routes.js';
import { clearElement } from '../domUtil.js';

export function mountLoginView(container, ctx) {
  const { document, session, navigate } = ctx;
  clearElement(container);

  const form = document.createElement('form');
  form.setAttribute('data-view', 'login');

  const emailInput = document.createElement('input');
  emailInput.type = 'email';
  emailInput.setAttribute('data-field', 'email');

  const passwordInput = document.createElement('input');
  passwordInput.type = 'password';
  passwordInput.setAttribute('data-field', 'password');

  const submit = document.createElement('button');
  submit.type = 'submit';
  submit.textContent = 'Log in';

  const status = document.createElement('div');
  status.setAttribute('data-role', 'status');

  form.appendChild(emailInput);
  form.appendChild(passwordInput);
  form.appendChild(submit);
  form.appendChild(status);
  container.appendChild(form);

  async function handleSubmit(event) {
    event?.preventDefault?.();
    status.textContent = 'Signing in...';
    try {
      await session.login(emailInput.value, passwordInput.value);
      status.textContent = '';
      navigate(buildHash('projects'));
    } catch (error) {
      status.textContent = error.message || 'Login failed.';
    }
  }

  form.addEventListener('submit', handleSubmit);

  return {
    unmount() { clearElement(container); },
    // exposed for tests that drive the form without real submit-event plumbing
    submit: handleSubmit,
    fields: { emailInput, passwordInput },
  };
}
