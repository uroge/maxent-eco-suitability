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
if analysis.status == 'running' and analysis.startedAt == cjson.null then
  analysis.startedAt = ARGV[4]
elseif analysis.status == 'succeeded' or analysis.status == 'failed' then
  analysis.completedAt = ARGV[4]
elseif analysis.status == 'cancelled' then
  analysis.cancelledAt = ARGV[4]
end
redis.call('SET', KEYS[1], cjson.encode(analysis), 'KEEPTTL')
return { 'updated', cjson.encode(analysis) }
