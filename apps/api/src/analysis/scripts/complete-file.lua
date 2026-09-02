local payload = redis.call('GET', KEYS[1])
if not payload then
  return { 'missing' }
end

local upload = cjson.decode(payload)
if upload.ownerId ~= ARGV[1] or upload.analysisId ~= ARGV[2] or upload.datasetId ~= ARGV[3] then
  return { 'missing' }
end
if upload.status == 'completed' then
  return { 'completed', payload }
end
if upload.status ~= 'pending' then
  return { 'invalid' }
end

upload.status = 'completed'
redis.call('SET', KEYS[1], cjson.encode(upload), 'KEEPTTL')
return { 'completed', cjson.encode(upload) }
