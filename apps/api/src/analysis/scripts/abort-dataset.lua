local payload = redis.call('GET', KEYS[1])
if not payload then
  return { 'missing' }
end

local dataset = cjson.decode(payload)
if dataset.ownerId ~= ARGV[1] or dataset.analysisId ~= ARGV[2] then
  return { 'missing' }
end
if dataset.status == 'aborted' then
  return { 'aborted', cjson.encode(dataset) }
end

dataset.status = 'aborted'
dataset.updatedAt = ARGV[3]
redis.call('SET', KEYS[1], cjson.encode(dataset), 'KEEPTTL')
redis.call('SREM', KEYS[3], dataset.id)
local analysisPayload = redis.call('GET', KEYS[2])
if analysisPayload then
  local analysis = cjson.decode(analysisPayload)
  if analysis.occurrenceDatasetId == dataset.id then
    analysis.occurrenceDatasetId = cjson.null
    analysis.updatedAt = ARGV[3]
    redis.call('SET', KEYS[2], cjson.encode(analysis))
  end
end
return { 'aborted', cjson.encode(dataset) }
