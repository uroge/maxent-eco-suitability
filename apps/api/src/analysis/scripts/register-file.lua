local payload = redis.call('GET', KEYS[1])
if not payload then
  return { 'missing' }
end

local dataset = cjson.decode(payload)
if dataset.ownerId ~= ARGV[1] or dataset.analysisId ~= ARGV[2] then
  return { 'missing' }
end
if dataset.status ~= 'collecting' then
  return { 'invalid' }
end

local component = ARGV[3]
if component ~= '' then
  local basename = ARGV[4]
  if dataset.shapefileBasename and dataset.shapefileBasename ~= basename then
    return { 'invalid_basename' }
  end
  dataset.shapefileBasename = basename
  for _, uploadId in ipairs(dataset.uploadIds) do
    local uploadPayload = redis.call('GET', KEYS[2] .. uploadId)
    if uploadPayload then
      local upload = cjson.decode(uploadPayload)
      if upload.component == component then
        return { 'duplicate_component' }
      end
    end
  end
end

dataset.uploadIds[#dataset.uploadIds + 1] = ARGV[5]
dataset.updatedAt = ARGV[6]
redis.call('SET', KEYS[1], cjson.encode(dataset), 'KEEPTTL')
redis.call('SET', KEYS[2] .. ARGV[5], ARGV[7], 'EX', ARGV[8])
return { 'created', ARGV[7] }
