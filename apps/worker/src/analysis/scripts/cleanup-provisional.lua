local provisionalPayload = redis.call('GET', KEYS[1])
if not provisionalPayload then
  return { 'missing' }
end

local provisional = cjson.decode(provisionalPayload)
local objectKeys = {}
local inputsPayload = redis.call('GET', KEYS[4])
if inputsPayload then
  local inputs = cjson.decode(inputsPayload)
  for _, dataset in ipairs(inputs.datasets) do
    for _, file in ipairs(dataset.files) do
      objectKeys[#objectKeys + 1] = file.storageKey
    end
  end
end
for _, artifact in ipairs(provisional.artifacts) do
  objectKeys[#objectKeys + 1] = artifact.storageKey
end
local cleanup = { id = ARGV[1], analysisId = provisional.analysisId, objectKeys = objectKeys, multipartUploads = {}, attempt = 0, nextAttemptAt = ARGV[2], createdAt = ARGV[2] }
redis.call('SET', KEYS[2], cjson.encode(cleanup))
redis.call('ZADD', KEYS[3], ARGV[3], ARGV[1])
redis.call('DEL', KEYS[1])
redis.call('DEL', KEYS[4])
return { 'scheduled' }
