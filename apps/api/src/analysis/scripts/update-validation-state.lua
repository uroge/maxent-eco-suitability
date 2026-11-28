local payload = redis.call('GET', KEYS[1])
if not payload then return { 'missing' } end
local analysis = cjson.decode(payload)
if analysis.ownerId ~= ARGV[1] then return { 'missing' } end
if analysis.status ~= 'ready' then return { 'stale' } end
if (analysis.inputRevision or 0) ~= tonumber(ARGV[3]) then return { 'stale' } end
if ARGV[2] == 'preflight' and (analysis.configurationRevision or 0) ~= tonumber(ARGV[4]) then
  return { 'stale' }
end
local validation = cjson.decode(ARGV[5])
if ARGV[2] == 'preflight' and analysis.configurationFingerprint ~= validation.configurationFingerprint then
  return { 'stale' }
end
local existing = analysis[ARGV[2]]
local replay = type(existing) == 'table' and existing.inputRevision == validation.inputRevision and
  existing.inputFingerprint == validation.inputFingerprint and
  existing.configurationRevision == validation.configurationRevision and
  existing.configurationFingerprint == validation.configurationFingerprint and
  (existing.status == 'queued' or existing.status == 'running' or existing.status == 'passed' or existing.status == 'blocked')
if ARGV[9] == 'repair' and not replay then return { 'stale' } end
if replay then validation = existing end

if validation.status == 'queued' or validation.status == 'running' then
  local outboxPayload = redis.call('GET', KEYS[2])
  local outbox = outboxPayload and cjson.decode(outboxPayload)
  if not outbox or outbox.createdAt ~= validation.createdAt or
    outbox.validation.inputRevision ~= validation.inputRevision or
    outbox.validation.configurationRevision ~= validation.configurationRevision then
    local entry = cjson.encode({
      analysisId = analysis.id,
      ownerId = analysis.ownerId,
      status = 'pending',
      createdAt = validation.createdAt,
      dispatchedAt = cjson.null,
      leaseId = cjson.null,
      leaseExpiresAt = cjson.null,
      validation = {
        kind = ARGV[2],
        inputRevision = validation.inputRevision,
        configurationRevision = validation.configurationRevision,
      },
    })
    local ttl = redis.call('PTTL', KEYS[1])
    if ttl > 0 then
      redis.call('SET', KEYS[2], entry, 'PX', ttl)
    else
      redis.call('SET', KEYS[2], entry)
    end
    redis.call('ZADD', KEYS[3], ARGV[8], ARGV[7])
  end
end
if replay then return { 'updated', payload } end

local validationPlaceholder = '__ECOSUITABILITY_VALIDATION_JSON_7b15c85e__'
analysis[ARGV[2]] = validationPlaceholder
analysis.updatedAt = ARGV[6]
local updated = cjson.encode(analysis)
updated = string.gsub(
  updated,
  cjson.encode(validationPlaceholder),
  function() return ARGV[5] end,
  1
)
redis.call('SET', KEYS[1], updated, 'KEEPTTL')
return { 'updated', updated }
