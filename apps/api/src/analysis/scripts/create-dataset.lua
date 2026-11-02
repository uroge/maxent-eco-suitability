local existing = redis.call('GET', KEYS[2])
if existing then
  local idempotency = cjson.decode(existing)
  if idempotency.fingerprint == ARGV[2] and idempotency.response then
    local previous = cjson.decode(idempotency.response)
    if previous.id and redis.call('EXISTS', KEYS[1] .. previous.id) == 1 then
      return { 'replay', idempotency.response }
    end
    if previous.id then
      redis.call('ZREM', KEYS[3], previous.id)
      redis.call('SREM', KEYS[5], previous.id)
    end
    redis.call('DEL', KEYS[2])
  else
    return { 'conflict' }
  end
end

local analysisPayload = redis.call('GET', KEYS[4])
if not analysisPayload then
  return { 'missing' }
end

local analysis = cjson.decode(analysisPayload)
if analysis.ownerId ~= ARGV[6] then
  return { 'missing' }
end
if analysis.status == 'draft' then
  analysis.status = 'uploading'
  analysis.updatedAt = ARGV[7]
elseif analysis.status ~= 'uploading' and not (analysis.status == 'ready' and ARGV[9] ~= '') then
  return { 'invalid_analysis' }
end

if ARGV[9] ~= '' then
  local manifestPayload = redis.call('GET', KEYS[6])
  if not manifestPayload then return { 'replacement_missing' } end
  local manifest = cjson.decode(manifestPayload)
  local replacement = nil
  for _, attached in ipairs(manifest.datasets) do
    if attached.dataset.id == ARGV[9] then replacement = attached end
  end
  if replacement == nil or replacement.dataset.kind ~= ARGV[8] then
    return { 'replacement_missing' }
  end
elseif ARGV[8] == 'occurrence' then
  if type(analysis.occurrenceDatasetId) == 'string' and analysis.occurrenceDatasetId ~= ARGV[1] then
    local reservedPayload = redis.call('GET', KEYS[1] .. analysis.occurrenceDatasetId)
    if reservedPayload then
      local reserved = cjson.decode(reservedPayload)
      if reserved.ownerId == ARGV[6] and reserved.analysisId == analysis.id and reserved.status == 'collecting' and reserved.fingerprint == ARGV[2] then
        local analysisTtl = redis.call('PTTL', KEYS[4])
        if analysisTtl > 0 then
          redis.call('SET', KEYS[2], cjson.encode({ fingerprint = ARGV[2], response = reservedPayload }), 'PX', analysisTtl)
        end
        return { 'replay', reservedPayload }
      end
      return { 'occurrence_reserved' }
    end
    analysis.occurrenceDatasetId = cjson.null
  end
  analysis.occurrenceDatasetId = ARGV[1]
end

redis.call('SET', KEYS[1] .. ARGV[1], ARGV[3], 'EX', ARGV[4])
local analysisTtl = redis.call('PTTL', KEYS[4])
if analysisTtl > 0 then
  redis.call('SET', KEYS[2], cjson.encode({ fingerprint = ARGV[2], response = ARGV[3] }), 'PX', analysisTtl)
end
redis.call('ZADD', KEYS[3], ARGV[5], ARGV[1])
redis.call('SADD', KEYS[5], ARGV[1])
redis.call('SET', KEYS[4], cjson.encode(analysis), 'KEEPTTL')
return { 'created', ARGV[3] }
