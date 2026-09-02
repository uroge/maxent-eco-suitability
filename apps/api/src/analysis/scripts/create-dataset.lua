local existing = redis.call('GET', KEYS[2])
if existing then
  local idempotency = cjson.decode(existing)
  if idempotency.fingerprint == ARGV[2] then
    local dataset = redis.call('GET', KEYS[1] .. idempotency.datasetId)
    if dataset then
      return { 'replay', dataset }
    end
  end
  return { 'conflict' }
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
elseif analysis.status ~= 'uploading' then
  return { 'invalid_analysis' }
end

if ARGV[8] == 'occurrence' then
  if type(analysis.occurrenceDatasetId) == 'string' and analysis.occurrenceDatasetId ~= ARGV[1] then
    return { 'occurrence_reserved' }
  end
  analysis.occurrenceDatasetId = ARGV[1]
end

redis.call('SET', KEYS[1] .. ARGV[1], ARGV[3], 'EX', ARGV[4])
redis.call('SET', KEYS[2], cjson.encode({ datasetId = ARGV[1], fingerprint = ARGV[2] }), 'EX', ARGV[4])
redis.call('ZADD', KEYS[3], ARGV[5], ARGV[1])
redis.call('SADD', KEYS[5], ARGV[1])
redis.call('SET', KEYS[4], cjson.encode(analysis))
return { 'created', ARGV[3] }
