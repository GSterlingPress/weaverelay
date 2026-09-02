export const PROVIDERS = Object.freeze({
  github: {
    label: 'GitHub',
    category: 'source',
    authorization: 'oauth',
    purpose: 'Repository and deployment-source access selected by the customer.',
  },
  netlify: {
    label: 'Netlify',
    category: 'hosting',
    authorization: 'oauth-or-token',
    purpose: 'Site, deploy, domain and environment configuration selected by the customer.',
  },
  supabase: {
    label: 'Supabase',
    category: 'backend',
    authorization: 'oauth-or-token',
    purpose: 'Project configuration and health checks selected by the customer.',
  },
  stripe: {
    label: 'Stripe',
    category: 'payments',
    authorization: 'restricted-key',
    purpose: 'Restricted read-only account health without collecting customer financial records.',
  },
  resend: {
    label: 'Resend',
    category: 'email',
    authorization: 'api-key',
    purpose: 'Domain and sending configuration selected by the customer.',
  },
  railway: {
    label: 'Railway',
    category: 'runtime',
    authorization: 'oauth-or-token',
    purpose: 'Service and environment configuration selected by the customer.',
  },
  runpod: {
    label: 'RunPod',
    category: 'compute',
    authorization: 'api-key',
    purpose: 'Compute connection status; spend actions must remain separately confirmed.',
  },
});

export function providerRecord(id, input = {}) {
  const definition = PROVIDERS[id];
  if (!definition) throw new Error(`Unsupported provider: ${id}`);
  const allowed = new Set(['not_connected', 'pending', 'detected', 'needs_action', 'connected', 'error', 'revoked']);
  const status = allowed.has(input.status) ? input.status : 'not_connected';
  return {
    id,
    label: definition.label,
    category: definition.category,
    authorization: definition.authorization,
    purpose: definition.purpose,
    status,
    detail: String(input.detail || ''),
    checkedAt: input.checkedAt || null,
  };
}

export function connectionPlan(providers = []) {
  return providers.map((provider) => {
    if (provider.status === 'connected') return { provider: provider.id, state: 'done', next: 'No action needed.' };
    if (provider.status === 'detected') return { provider: provider.id, state: 'verify', next: `Verify the existing ${provider.label} connection without replacing it.` };
    if (provider.status === 'error') return { provider: provider.id, state: 'repair', next: `Repair ${provider.label} using the least-privilege authorization method.` };
    return { provider: provider.id, state: 'connect', next: `Authorize ${provider.label} with the minimum permissions needed for this workspace.` };
  });
}
