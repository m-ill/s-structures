export const EVIDENCE_CLIENT_VERSION = 'p3-evidence-client-v1';

export function createEvidenceClient(api) {
  return {
    version: EVIDENCE_CLIENT_VERSION,

    async listProjectEvidence(projectId) {
      const result = await api.get(`/api/projects/${encodeURIComponent(projectId)}/evidence`);
      return {
        evidence: result.evidence || [],
        register: result.register,
      };
    },

    async submitProjectEvidence(projectId, evidence) {
      const result = await api.post(`/api/projects/${encodeURIComponent(projectId)}/evidence`, {
        body: { evidence },
      });
      return {
        evidence: result.evidence,
        register: result.register,
      };
    },
  };
}
