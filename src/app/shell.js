import { matchRoute, buildHash } from './routes.js';
import { mountLoginView } from './views/login.js';
import { mountProjectsView } from './views/projects.js';
import { mountImportReviewView } from './views/importReview.js';
import { mountLibraryView } from './views/library.js';
import { mountRevisionsView } from './views/revisions.js';
import { mountReportView } from './views/report.js';
import { mountModelerHostView } from './modelerHost.js';
import { clearElement } from './domUtil.js';
import { APP_SHELL_VERSION } from '../platform/platformVersion.js';

export { APP_SHELL_VERSION };

const PUBLIC_ROUTES = new Set(['login', 'localModeler']);

const VIEW_MOUNTERS = {
  login: mountLoginView,
  projects: mountProjectsView,
  modeler: mountModelerHostView,
  localModeler: mountModelerHostView,
  importReview: mountImportReviewView,
  library: mountLibraryView,
  revisions: mountRevisionsView,
  report: mountReportView,
};

export function createAppShell(options) {
  const { window, document, api, session, mountPoint, modelerBridgeFactory } = options;
  let current = null;
  let lastResult = null;
  let routing = false;
  let reroutePending = false;
  let rerouteScheduled = false;

  function navigate(hash) {
    if (window.location.hash === hash) {
      route();
    } else {
      window.location.hash = hash;
    }
  }

  function route() {
    if (routing) {
      reroutePending = true;
      scheduleReroute();
      return lastResult;
    }
    routing = true;
    try {
      return routeNow();
    } finally {
      routing = false;
      if (reroutePending) scheduleReroute();
    }
  }

  function routeNow() {
    const match = matchRoute(window.location.hash) || { name: 'localModeler', params: {}, path: '/local/modeler' };
    const state = session.getState();
    const targetName = (!state.authenticated && !PUBLIC_ROUTES.has(match.name)) ? 'login' : match.name;

    if (current?.unmount) current.unmount();
    const mounter = VIEW_MOUNTERS[targetName];
    if (!mounter) {
      clearElement(mountPoint);
      const message = document.createElement('div');
      message.setAttribute('data-role', 'not-found');
      message.textContent = `Unknown route: ${match.path}`;
      mountPoint.appendChild(message);
      current = null;
      lastResult = { name: 'not-found' };
      return lastResult;
    }
    current = mounter(mountPoint, { document, window, api, session, navigate, params: match.params, modelerBridgeFactory });
    lastResult = { name: targetName, params: match.params };
    return lastResult;
  }

  function scheduleReroute() {
    if (rerouteScheduled) return;
    rerouteScheduled = true;
    const defer = window.queueMicrotask || globalThis.queueMicrotask || ((callback) => Promise.resolve().then(callback));
    defer(() => {
      rerouteScheduled = false;
      if (!reroutePending) return;
      reroutePending = false;
      route();
    });
  }

  window.addEventListener('hashchange', route);
  if (typeof session.onChange === 'function') {
    session.onChange(() => route());
  }

  return {
    version: APP_SHELL_VERSION,
    start() {
      if (!window.location.hash) {
        // Setting the hash fires the hashchange listener, which performs the
        // initial route() call and records it in lastResult.
        window.location.hash = buildHash('localModeler');
        return lastResult;
      }
      return route();
    },
    navigate,
    getCurrentView() { return current; },
    getRoutingState() {
      return { routing, reroutePending, rerouteScheduled };
    },
    dispose() {
      window.removeEventListener('hashchange', route);
    },
  };
}
