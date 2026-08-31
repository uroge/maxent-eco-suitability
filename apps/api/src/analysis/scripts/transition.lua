local payload = redis.call('GET', KEYS[1])
if not payload then
  return { 'missing' }
end

local analysis = cjson.decode(payload)
if analysis.ownerId ~= ARGV[1] then
  return { 'missing' }
end

local allowed = cjson.decode(ARGV[2])
local matches = false
for _, status in ipairs(allowed) do
  if analysis.status == status then
    matches = true
    break
  end
end

if not matches then
  return { 'invalid', analysis.status }
end

analysis.status = ARGV[3]
analysis.updatedAt = ARGV[4]
analysis.failure = cjson.decode(ARGV[5])
redis.call('SET', KEYS[1], cjson.encode(analysis), 'KEEPTTL')
return { 'updated', cjson.encode(analysis) }
