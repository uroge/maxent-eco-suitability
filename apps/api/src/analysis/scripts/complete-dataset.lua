local payload = redis.call('GET', KEYS[1])
if not payload then
  return { 'missing' }
end

local dataset = cjson.decode(payload)
if dataset.ownerId ~= ARGV[1] or dataset.analysisId ~= ARGV[2] then
  return { 'missing' }
end

local analysisPayload = redis.call('GET', KEYS[3])
if not analysisPayload then
  return { 'missing' }
end
local analysis = cjson.decode(analysisPayload)
if analysis.status ~= 'uploading' then
  return { 'invalid_analysis' }
end

local now = ARGV[5]
if dataset.status == 'completing' and dataset.completionClaimExpiresAt and dataset.completionClaimExpiresAt > now then
  return { 'claimed' }
end
if dataset.status ~= 'collecting' and dataset.status ~= 'completing' then
  return { 'invalid' }
end

local required = cjson.decode(ARGV[3])
local completed = {}
for _, uploadId in ipairs(dataset.uploadIds) do
  local uploadPayload = redis.call('GET', KEYS[2] .. uploadId)
  if not uploadPayload then
    return { 'incomplete' }
  end
  local upload = cjson.decode(uploadPayload)
  if upload.status ~= 'completed' then
    return { 'incomplete' }
  end
  if upload.component then
    completed[upload.component] = true
  end
end
for _, component in ipairs(required) do
  if not completed[component] then
    return { 'incomplete' }
  end
end
if #dataset.uploadIds == 0 then
  return { 'incomplete' }
end

dataset.status = 'completing'
dataset.updatedAt = now
dataset.completionClaimId = ARGV[4]
dataset.completionClaimExpiresAt = ARGV[6]
redis.call('SET', KEYS[1], cjson.encode(dataset), 'KEEPTTL')
return { 'claimed', cjson.encode(dataset) }
