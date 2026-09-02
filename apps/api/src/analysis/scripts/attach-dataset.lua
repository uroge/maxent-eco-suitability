local datasetPayload = redis.call('GET', KEYS[1])
if not datasetPayload then
  return { 'missing' }
end

local dataset = cjson.decode(datasetPayload)
if dataset.ownerId ~= ARGV[1] or dataset.analysisId ~= ARGV[2] then
  return { 'missing' }
end
if dataset.status ~= 'completing' or dataset.completionClaimId ~= ARGV[3] then
  return { 'invalid' }
end

local analysisPayload = redis.call('GET', KEYS[2])
if not analysisPayload then
  return { 'missing' }
end
local analysis = cjson.decode(analysisPayload)
if analysis.status ~= 'uploading' then
  return { 'invalid_analysis' }
end

local manifest = { datasets = {} }
local manifestPayload = redis.call('GET', KEYS[3])
if manifestPayload then
  manifest = cjson.decode(manifestPayload)
end
for _, attached in ipairs(manifest.datasets) do
  if attached.dataset.id == dataset.id then
    return { 'attached', cjson.encode(attached.dataset) }
  end
  if dataset.kind == 'occurrence' and attached.dataset.kind == 'occurrence' then
    return { 'occurrence_taken' }
  end
end

local attached = cjson.decode(ARGV[4])
manifest.datasets[#manifest.datasets + 1] = attached
redis.call('SET', KEYS[3], cjson.encode(manifest))
for _, uploadId in ipairs(dataset.uploadIds) do
  redis.call('DEL', KEYS[6] .. uploadId)
end
redis.call('DEL', KEYS[1])
redis.call('DEL', KEYS[4])
redis.call('ZREM', KEYS[5], dataset.id)
redis.call('SREM', KEYS[7], dataset.id)
return { 'attached', cjson.encode(attached.dataset) }
