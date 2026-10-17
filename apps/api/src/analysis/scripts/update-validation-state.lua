local payload = redis.call('GET', KEYS[1])
if not payload then return { 'missing' } end
local analysis = cjson.decode(payload)
if analysis.ownerId ~= ARGV[1] then return { 'missing' } end
if (analysis.inputRevision or 0) ~= tonumber(ARGV[3]) then return { 'stale' } end
if ARGV[2] == 'preflight' and (analysis.configurationRevision or 0) ~= tonumber(ARGV[4]) then
  return { 'stale' }
end
local validation = cjson.decode(ARGV[5])
if ARGV[2] == 'preflight' and analysis.configurationFingerprint ~= validation.configurationFingerprint then
  return { 'stale' }
end
local validationPlaceholder = '__ECOSUITABILITY_VALIDATION_JSON_7b15c85e__'
analysis[ARGV[2]] = validationPlaceholder
analysis.updatedAt = ARGV[6]
local updated = cjson.encode(analysis)
updated = string.gsub(
  updated,
  cjson.encode(validationPlaceholder),
  function() return ARGV[5] end,
  1
)
redis.call('SET', KEYS[1], updated, 'KEEPTTL')
return { 'updated', updated }
