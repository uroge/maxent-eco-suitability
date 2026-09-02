local analysisPayload = redis.call('GET', KEYS[1])
if not analysisPayload then
  return { 'missing' }
end

local analysis = cjson.decode(analysisPayload)
if analysis.ownerId ~= ARGV[1] then
  return { 'missing' }
end
if analysis.status == 'ready' then
  return { 'ready', analysisPayload }
end
if analysis.status ~= 'uploading' then
  return { 'invalid' }
end

local manifestPayload = redis.call('GET', KEYS[2])
if not manifestPayload then
  return { 'incomplete' }
end
local manifest = cjson.decode(manifestPayload)
local occurrences = 0
local predictors = 0
for _, dataset in ipairs(manifest.datasets) do
  if dataset.dataset.kind == 'occurrence' then
    occurrences = occurrences + 1
  elseif dataset.dataset.kind == 'predictor' then
    predictors = predictors + 1
  end
end
if occurrences ~= 1 or predictors < 1 then
  return { 'incomplete' }
end

analysis.status = 'ready'
analysis.updatedAt = ARGV[2]
redis.call('SET', KEYS[1], cjson.encode(analysis))
return { 'ready', cjson.encode(analysis) }
