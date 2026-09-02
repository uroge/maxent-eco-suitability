local analysisPayload = redis.call('GET', KEYS[1])
if not analysisPayload then
  return { 'missing' }
end

local analysis = cjson.decode(analysisPayload)
if ARGV[1] ~= '' and analysis.ownerId ~= ARGV[1] then
  return { 'missing' }
end

local expected = cjson.decode(ARGV[2])
local allowed = false
for _, status in ipairs(expected) do
  if analysis.status == status then
    allowed = true
    break
  end
end
if not allowed then
  return { 'invalid' }
end

local manifest = { datasets = {} }
local manifestPayload = redis.call('GET', KEYS[2])
if manifestPayload then
  manifest = cjson.decode(manifestPayload)
end
local objectKeys = {}
local multipartUploads = {}
for _, dataset in ipairs(manifest.datasets) do
  for _, file in ipairs(dataset.files) do
    objectKeys[#objectKeys + 1] = file.storageKey
  end
end
for _, datasetId in ipairs(redis.call('SMEMBERS', KEYS[7])) do
  local datasetPayload = redis.call('GET', KEYS[8] .. datasetId)
  if datasetPayload then
    local dataset = cjson.decode(datasetPayload)
    for _, uploadId in ipairs(dataset.uploadIds) do
      local uploadPayload = redis.call('GET', KEYS[9] .. uploadId)
      if uploadPayload then
        local upload = cjson.decode(uploadPayload)
        objectKeys[#objectKeys + 1] = upload.objectKey
        if upload.multipartUploadId then
          multipartUploads[#multipartUploads + 1] = { key = upload.objectKey, uploadId = upload.multipartUploadId }
        end
        redis.call('DEL', KEYS[9] .. uploadId)
      end
    end
    redis.call('DEL', KEYS[8] .. datasetId)
    redis.call('DEL', KEYS[10] .. dataset.ownerId .. ':' .. dataset.analysisId .. ':' .. dataset.idempotencyKey)
    redis.call('ZREM', KEYS[11], datasetId)
  end
end
redis.call('DEL', KEYS[7])

local cleanup = {
  id = ARGV[3],
  analysisId = analysis.id,
  objectKeys = objectKeys,
  multipartUploads = multipartUploads,
  attempt = 0,
  nextAttemptAt = ARGV[4],
  createdAt = ARGV[4]
}
redis.call('SET', KEYS[3], cjson.encode(cleanup))
redis.call('ZADD', KEYS[4], ARGV[5], ARGV[3])
redis.call('DEL', KEYS[2])

analysis.status = ARGV[6]
analysis.updatedAt = ARGV[4]
analysis.failure = cjson.null
if ARGV[6] == 'expired' then
  analysis.expiredAt = ARGV[4]
  redis.call('SET', KEYS[1], cjson.encode(analysis), 'EX', ARGV[7])
  redis.call('DEL', KEYS[6] .. analysis.ownerId .. ':' .. analysis.idempotencyKey)
  redis.call('ZREM', KEYS[5], analysis.id)
else
  redis.call('SET', KEYS[1], cjson.encode(analysis))
end
return { 'scheduled', cjson.encode(analysis) }
