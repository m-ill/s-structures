export function resolveGlobalShearDeformation(modelOrSettings = {}) {
  const settings = settingsOf(modelOrSettings);
  if (Object.hasOwn(settings, 'shearDeformation') && Object.hasOwn(settings, 'includeShearDeformation')) {
    const canonical = settings.shearDeformation;
    const legacy = settings.includeShearDeformation;
    const valid = typeof canonical === 'boolean' && typeof legacy === 'boolean' && canonical === legacy;
    return {
      enabled: valid ? canonical : false,
      source: valid
        ? 'analysisSettings.shearDeformation'
        : 'analysisSettings.shearDeformation+includeShearDeformation-conflict',
      legacy: false,
      valid,
      conflict: !valid,
    };
  }
  if (Object.hasOwn(settings, 'shearDeformation')) {
    const valid = typeof settings.shearDeformation === 'boolean';
    return {
      enabled: valid ? settings.shearDeformation : false,
      source: 'analysisSettings.shearDeformation',
      legacy: false,
      valid,
    };
  }
  if (Object.hasOwn(settings, 'includeShearDeformation')) {
    const valid = typeof settings.includeShearDeformation === 'boolean';
    return {
      enabled: valid ? settings.includeShearDeformation : false,
      source: 'analysisSettings.includeShearDeformation',
      legacy: true,
      valid,
    };
  }
  return {
    enabled: false,
    source: 'legacy-absent-default',
    legacy: true,
    valid: true,
  };
}

export function resolveMemberShearDeformationSetting(modelOrSettings = {}, member = {}) {
  const global = resolveGlobalShearDeformation(modelOrSettings);
  const override = memberOverride(member);
  if (!global.valid) {
    return {
      enabled: false,
      requested: false,
      source: global.source,
      settingSource: global.source,
      override: override ? override.enabled : null,
      legacy: global.legacy,
      valid: false,
      conflict: global.conflict === true,
    };
  }
  return {
    enabled: override ? override.enabled : global.enabled,
    requested: override ? override.enabled : global.enabled,
    source: override?.source || global.source,
    settingSource: override?.source || global.source,
    override: override ? override.enabled : null,
    legacy: override?.legacy ?? global.legacy,
    valid: override?.valid ?? global.valid,
  };
}

function settingsOf(input) {
  if (input?.analysisSettings && typeof input.analysisSettings === 'object') return input.analysisSettings;
  return input && typeof input === 'object' ? input : {};
}

function memberOverride(member) {
  if (Object.hasOwn(member, 'shearDeformation') && Object.hasOwn(member, 'includeShearDeformation')) {
    const canonical = member.shearDeformation;
    const legacy = member.includeShearDeformation;
    const valid = typeof canonical === 'boolean' && typeof legacy === 'boolean' && canonical === legacy;
    return {
      enabled: valid ? canonical : false,
      source: valid ? 'member.shearDeformation' : 'member.shearDeformation+includeShearDeformation-conflict',
      legacy: false,
      valid,
      conflict: !valid,
    };
  }
  if (Object.hasOwn(member, 'shearDeformation')) {
    const valid = typeof member.shearDeformation === 'boolean';
    return { enabled: valid ? member.shearDeformation : false, source: 'member.shearDeformation', legacy: false, valid };
  }
  if (Object.hasOwn(member, 'includeShearDeformation')) {
    const valid = typeof member.includeShearDeformation === 'boolean';
    return { enabled: valid ? member.includeShearDeformation : false, source: 'member.includeShearDeformation', legacy: true, valid };
  }
  return null;
}
