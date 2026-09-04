const DEFAULT_TIMEOUT_MS = 8000;

function statusOf(result = {}) {
  const n = Number(result.status);
  return Number.isFinite(n) ? n : 0;
}

function ok(result = {}) {
  const s = statusOf(result);
  return result.ok === true || (s >= 200 && s < 400);
}

function failed(result = {}) {
  return result.error || statusOf(result) >= 400 || statusOf(result) === 0;
}

function publicHealthy(round = {}) {
  return ok(round.apex) && ok(round.www);
}

export async function probeUrl(url, { fetchImpl = fetch, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  const observedAt = new Date().toISOString();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, {
      method: 'GET',
      redirect: 'follow',
      cache: 'no-store',
      headers: { 'user-agent': 'WeaveRelay-Independent-Self-Monitor/1.0' },
      signal: controller.signal,
    });
    return {
      url,
      observedAt,
      ok: response.ok,
      status: response.status,
      finalUrl: response.url || url,
      server: response.headers?.get?.('server') || null,
      cfRay: response.headers?.get?.('cf-ray') || null,
      netlifyRequestId: response.headers?.get?.('x-nf-request-id') || null,
    };
  } catch (error) {
    return {
      url,
      observedAt,
      ok: false,
      status: 0,
      error: error?.name === 'AbortError' ? 'timeout' : 'network-error',
    };
  } finally {
    clearTimeout(timer);
  }
}

export function classifySelfOutage({ apex, www, origin, providerStatus } = {}) {
  const publicFailed = failed(apex) && failed(www);
  const originKnown = Boolean(origin);
  const originHealthy = originKnown && ok(origin);
  const platformHealthy = providerStatus?.netlifyOperational !== false;

  if (!publicFailed) {
    return {
      state: 'HEALTHY_OR_PARTIAL',
      severity: 'info',
      repairClass: 'none',
      safeAutoRepair: false,
      reason: 'At least one public production hostname is responding.',
      nextProof: 'Verify both apex and www plus a customer-facing functional journey.',
    };
  }

  if (originHealthy) {
    return {
      state: 'PUBLIC_EDGE_FAILURE',
      severity: 'critical',
      repairClass: 'dns-domain-proxy',
      safeAutoRepair: false,
      reason: 'Both public hostnames fail while the known hosting origin responds.',
      nextProof: 'Compare DNS, proxy, TLS and custom-domain assignment against the known-good origin before any mutation.',
    };
  }

  if (originKnown && !originHealthy && platformHealthy) {
    return {
      state: 'SITE_OR_DEPLOY_FAILURE',
      severity: 'critical',
      repairClass: 'hosting-site-deploy',
      safeAutoRepair: false,
      reason: 'Public hostnames and the known hosting origin fail while the hosting platform reports operational.',
      nextProof: 'Inspect the site assignment and latest published deploy; prepare a rollback or redeploy but require approval.',
    };
  }

  if (providerStatus?.netlifyOperational === false) {
    return {
      state: 'PROVIDER_INCIDENT',
      severity: 'critical',
      repairClass: 'wait-provider',
      safeAutoRepair: false,
      reason: 'The hosting provider reports an active incident that can explain the outage.',
      nextProof: 'Keep probing independently and verify recovery after the provider reports restoration.',
    };
  }

  return {
    state: 'OUTAGE_UNRESOLVED',
    severity: 'critical',
    repairClass: 'gather-evidence',
    safeAutoRepair: false,
    reason: 'The public site is unavailable, but there is not enough independent evidence to identify a safe repair target.',
    nextProof: 'Resolve the hosting origin and provider state before changing DNS, deployment or configuration.',
  };
}

export function buildSelfMonitorReport({ apex, www, origin, providerStatus } = {}) {
  const classification = classifySelfOutage({ apex, www, origin, providerStatus });
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    target: 'weaverelay.com',
    independent: true,
    observations: { apex, www, origin: origin || null, providerStatus: providerStatus || null },
    classification,
    recovery: {
      automaticMutationAllowed: false,
      approvalRequired: classification.repairClass !== 'none' && classification.repairClass !== 'wait-provider',
      verificationRequired: true,
      rule: 'Never repair the monitor from the same failed serving path; never mutate DNS, domain assignment or production deploy from ambiguous evidence.',
    },
  };
}

export function buildConfirmedSelfMonitorReport({ first, second, confirmationIntervalMs = 0 } = {}) {
  const firstReport = buildSelfMonitorReport(first || {});
  const secondReport = second ? buildSelfMonitorReport(second) : null;
  const firstCritical = firstReport.classification.severity === 'critical';
  const secondCritical = secondReport?.classification?.severity === 'critical';
  const firstHealthy = publicHealthy(first || {});
  const secondHealthy = second ? publicHealthy(second) : false;

  if (firstCritical) {
    if (!secondReport || !secondCritical) {
      return {
        ...(secondReport || firstReport),
        classification: {
          state: 'TRANSIENT_FAILURE_RECOVERED',
          severity: 'warn',
          repairClass: 'none',
          safeAutoRepair: false,
          reason: 'The first probe failed, but the immediate independent confirmation probe recovered.',
          nextProof: 'Keep monitoring. Do not open an incident or mutate production from a single transient failure.',
        },
        confirmation: {
          requiredConsecutiveFailures: 2,
          consecutiveFailures: 1,
          outageConfirmed: false,
          requiredConsecutiveHealthy: 2,
          consecutiveHealthy: secondHealthy ? 1 : 0,
          recoveryConfirmed: false,
          confirmationIntervalMs,
          firstClassification: firstReport.classification.state,
          secondClassification: secondReport?.classification?.state || null,
        },
      };
    }

    return {
      ...secondReport,
      confirmation: {
        requiredConsecutiveFailures: 2,
        consecutiveFailures: 2,
        outageConfirmed: true,
        requiredConsecutiveHealthy: 2,
        consecutiveHealthy: 0,
        recoveryConfirmed: false,
        confirmationIntervalMs,
        firstClassification: firstReport.classification.state,
        secondClassification: secondReport.classification.state,
        rule: 'An outage is declared only after two consecutive independent probe rounds fail.',
      },
    };
  }

  if (firstHealthy && secondHealthy) {
    return {
      ...secondReport,
      confirmation: {
        requiredConsecutiveFailures: 2,
        consecutiveFailures: 0,
        outageConfirmed: false,
        requiredConsecutiveHealthy: 2,
        consecutiveHealthy: 2,
        recoveryConfirmed: true,
        confirmationIntervalMs,
        firstClassification: firstReport.classification.state,
        secondClassification: secondReport.classification.state,
        rule: 'Recovery is announced only after two consecutive independent probe rounds confirm both apex and www are healthy.',
      },
    };
  }

  if (firstHealthy && secondReport && !secondHealthy) {
    return {
      ...secondReport,
      classification: {
        ...secondReport.classification,
        state: secondCritical ? secondReport.classification.state : 'RECOVERY_BOUNCE_DETECTED',
        severity: secondCritical ? 'critical' : 'warn',
        reason: secondCritical
          ? secondReport.classification.reason
          : 'The first recovery probe passed, but the confirmation probe did not keep both public hostnames healthy.',
        nextProof: 'Keep the incident open and require two fresh consecutive healthy rounds before announcing recovery.',
      },
      confirmation: {
        requiredConsecutiveFailures: 2,
        consecutiveFailures: secondCritical ? 1 : 0,
        outageConfirmed: false,
        requiredConsecutiveHealthy: 2,
        consecutiveHealthy: 1,
        recoveryConfirmed: false,
        confirmationIntervalMs,
        firstClassification: firstReport.classification.state,
        secondClassification: secondReport.classification.state,
      },
    };
  }

  return {
    ...firstReport,
    confirmation: {
      requiredConsecutiveFailures: 2,
      consecutiveFailures: 0,
      outageConfirmed: false,
      requiredConsecutiveHealthy: 2,
      consecutiveHealthy: firstHealthy ? 1 : 0,
      recoveryConfirmed: false,
      confirmationIntervalMs,
      reason: secondReport ? 'Both public hostnames were not healthy in both rounds.' : 'A confirmation probe is still required.',
    },
  };
}
