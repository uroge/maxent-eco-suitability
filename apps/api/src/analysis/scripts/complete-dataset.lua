local payload = redis.call('GET', KEYS[1])
if not payload then
  return { 'missing' }
end

local dataset = cjson.decode(payload)
if dataset.ownerId ~= ARGV[1] or dataset.analysisId ~= ARGV[2] then
  return { 'missing' }
end
if dataset.status == 'ready' then
  return { 'ready', payload }
end
if dataset.status ~= 'collecting' then
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

dataset.status = 'ready'
dataset.updatedAt = ARGV[4]
redis.call('SET', KEYS[1], cjson.encode(dataset), 'KEEPTTL')
return { 'ready', cjson.encode(dataset) }
