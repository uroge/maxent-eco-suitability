local analysisPayload = redis.call('GET', KEYS[1])
if not analysisPayload then
  return { 'missing' }
end
local analysis = cjson.decode(analysisPayload)
if analysis.status ~= 'cancelling' then
  return { 'invalid' }
end
local manifest = { datasets = {} }
local manifestPayload = redis.call('GET', KEYS[2])
if manifestPayload then
  manifest = cjson.decode(manifestPayload)
end
local objectKeys = {}
for _, dataset in ipairs(manifest.datasets) do
  for _, file in ipairs(dataset.files) do
    objectKeys[#objectKeys + 1] = file.storageKey
  end
end
local cleanup = { id = ARGV[1], analysisId = analysis.id, objectKeys = objectKeys, multipartUploads = {}, attempt = 0, nextAttemptAt = ARGV[2], createdAt = ARGV[2] }
redis.call('SET', KEYS[3], cjson.encode(cleanup))
redis.call('ZADD', KEYS[4], ARGV[3], ARGV[1])
analysis.status = 'cancelled'
analysis.updatedAt = ARGV[2]
analysis.progress = { stage = 'cancelled', percent = 0, attempt = analysis.execution.attempt, updatedAt = ARGV[2] }
redis.call('SET', KEYS[1], cjson.encode(analysis), 'KEEPTTL')
return { 'cancelled' }
