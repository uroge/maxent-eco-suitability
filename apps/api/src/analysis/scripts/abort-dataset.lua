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
return { 'aborted', cjson.encode(dataset) }
