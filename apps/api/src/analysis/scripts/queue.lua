local payload = redis.call('GET', KEYS[1])
if not payload then
  return { 'missing' }
end

local analysis = cjson.decode(payload)
if analysis.ownerId ~= ARGV[1] then
  return { 'missing' }
end

if analysis.status == 'queued' and type(analysis.execution) == 'table' and analysis.execution.jobId == ARGV[2] then
  return { 'queued', payload }
end

if analysis.status ~= 'ready' then
  return { 'invalid' }
end
if type(analysis.configuration) ~= 'table' or type(analysis.configurationRevision) ~= 'number' or type(analysis.configurationFingerprint) ~= 'string' then
  return { 'configuration_required' }
end
if ARGV[8] ~= '' and (
  (analysis.inputRevision or 0) ~= tonumber(ARGV[8]) or
  analysis.configurationRevision ~= tonumber(ARGV[9]) or
  analysis.configurationFingerprint ~= ARGV[10]
) then
  return { 'stale' }
end
if type(analysis.preflight) ~= 'table' or analysis.preflight.status ~= 'passed' or
  analysis.preflight.inputRevision ~= (analysis.inputRevision or 0) or
  analysis.preflight.inputFingerprint ~= ARGV[7] or
  analysis.preflight.configurationRevision ~= analysis.configurationRevision or
  analysis.preflight.configurationFingerprint ~= analysis.configurationFingerprint then
  return { 'preflight_required' }
end

local inputManifest = cjson.decode(ARGV[6])
if type(inputManifest.datasets) ~= 'table' then
  return { 'invalid' }
end

local now = ARGV[3]
local processingExpiresAt = ARGV[5]
analysis.status = 'queued'
analysis.updatedAt = now
analysis.expiresAt = processingExpiresAt
analysis.processingExpiresAt = processingExpiresAt
analysis.executionSnapshot = {
  configuration = analysis.configuration,
  inputRevision = analysis.inputRevision,
  configurationRevision = analysis.configurationRevision,
  fingerprint = analysis.configurationFingerprint,
  inputManifest = inputManifest,
  inputFingerprint = ARGV[7],
  validationReceipt = {
    inputRevision = analysis.preflight.inputRevision,
    inputFingerprint = analysis.preflight.inputFingerprint,
    configurationRevision = analysis.preflight.configurationRevision,
    configurationFingerprint = analysis.preflight.configurationFingerprint,
    policyVersion = analysis.preflight.policyVersion,
    completedAt = analysis.preflight.completedAt
  },
  queuedAt = now,
  processingExpiresAt = processingExpiresAt,
  seed = analysis.configuration.seed
}
analysis.queuedAt = now
analysis.failure = cjson.null
analysis.progress = { stage = 'queued', percent = 0, attempt = cjson.null, message = 'Waiting for the analysis worker.', updatedAt = now }
analysis.execution = { jobId = ARGV[2], attempt = cjson.null, outboxDispatchedAt = cjson.null }

local outbox = {
  analysisId = analysis.id,
  ownerId = analysis.ownerId,
  jobId = ARGV[2],
  status = 'pending',
  createdAt = now,
  dispatchedAt = cjson.null,
  leaseId = cjson.null,
  leaseExpiresAt = cjson.null
}

redis.call('SET', KEYS[1], cjson.encode(analysis), 'KEEPTTL')
local ttl = redis.call('PTTL', KEYS[1])
if ttl > 0 then
  redis.call('SET', KEYS[2], cjson.encode(outbox), 'PX', ttl)
else
  redis.call('SET', KEYS[2], cjson.encode(outbox))
end
redis.call('ZADD', KEYS[3], ARGV[4], analysis.id)
return { 'queued', cjson.encode(analysis) }
