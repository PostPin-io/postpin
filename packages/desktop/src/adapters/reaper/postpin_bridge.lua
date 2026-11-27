-- PostPin bridge for REAPER, installed and run by PostPin Desktop (packages/desktop, adapters/reaper).
-- Don't edit: PostPin Desktop overwrites this file.
--
-- PostPin Desktop runs this action over REAPER's web interface. ExtState postpin_bridge/req holds
-- the hex encoded path of a JSON request file ({"command": ..., "params": ...}); the answer goes
-- to <path>.out as {"ok": true, "result": ...} or {"ok": false, "error": "..."}. The web
-- interface waits for the action, so the answer is there when the HTTP request returns.

local SECTION = "postpin_bridge"
-- Project ExtState with what REAPER markers can't hold, per marker GUID
local MARKER_DATA = "PostPin_markers"
-- Project ExtState with the project's PostPin id, which survives Save As
local PROJECT = "PostPin"

---------------------------------------------------------------------------------------------------
-- JSON
---------------------------------------------------------------------------------------------------

local json = {}

local escapes = { ['"'] = '\\"', ["\\"] = "\\\\", ["\b"] = "\\b", ["\f"] = "\\f", ["\n"] = "\\n", ["\r"] = "\\r", ["\t"] = "\\t" }

local function encodeString(s)
  return '"' .. s:gsub('[%c"\\]', function(c)
    return escapes[c] or string.format("\\u%04x", c:byte())
  end) .. '"'
end

-- Arrays are tables with json.array set as their metatable, so empty ones stay arrays
json.array = {}
function json.arr(t) return setmetatable(t or {}, json.array) end
json.null = setmetatable({}, { __tostring = function() return "null" end })

function json.encode(v)
  local t = type(v)
  if v == nil or v == json.null then return "null" end
  if t == "boolean" then return tostring(v) end
  if t == "number" then
    if v ~= v or v == math.huge or v == -math.huge then return "null" end
    if math.type(v) == "integer" then return tostring(v) end
    return string.format("%.17g", v)
  end
  if t == "string" then return encodeString(v) end
  if t == "table" then
    local out = {}
    if getmetatable(v) == json.array then
      for i = 1, #v do out[i] = json.encode(v[i]) end
      return "[" .. table.concat(out, ",") .. "]"
    end
    for k, value in pairs(v) do
      out[#out + 1] = encodeString(tostring(k)) .. ":" .. json.encode(value)
    end
    return "{" .. table.concat(out, ",") .. "}"
  end
  error("can't encode " .. t)
end

function json.decode(s)
  local pos = 1
  local function ws() pos = s:find("[^ \t\r\n]", pos) or #s + 1 end
  local value
  local function str()
    local out = {}
    pos = pos + 1
    while true do
      local c = s:sub(pos, pos)
      if c == "" then error("unterminated string") end
      if c == '"' then pos = pos + 1; return table.concat(out) end
      if c == "\\" then
        local e = s:sub(pos + 1, pos + 1)
        if e == "u" then
          local code = tonumber(s:sub(pos + 2, pos + 5), 16)
          pos = pos + 6
          -- a surrogate pair
          if code >= 0xD800 and code <= 0xDBFF and s:sub(pos, pos + 1) == "\\u" then
            local low = tonumber(s:sub(pos + 2, pos + 5), 16)
            code = 0x10000 + ((code - 0xD800) << 10) + (low - 0xDC00)
            pos = pos + 6
          end
          out[#out + 1] = utf8.char(code)
        else
          local map = { b = "\b", f = "\f", n = "\n", r = "\r", t = "\t" }
          out[#out + 1] = map[e] or e
          pos = pos + 2
        end
      else
        local next = s:find('["\\]', pos) or #s + 1
        out[#out + 1] = s:sub(pos, next - 1)
        pos = next
      end
    end
  end
  function value()
    ws()
    local c = s:sub(pos, pos)
    if c == "{" then
      local obj = {}
      pos = pos + 1
      ws()
      if s:sub(pos, pos) == "}" then pos = pos + 1; return obj end
      while true do
        ws()
        local key = str()
        ws()
        pos = pos + 1 -- :
        obj[key] = value()
        ws()
        local sep = s:sub(pos, pos)
        pos = pos + 1
        if sep == "}" then return obj end
      end
    elseif c == "[" then
      local arr = json.arr()
      pos = pos + 1
      ws()
      if s:sub(pos, pos) == "]" then pos = pos + 1; return arr end
      while true do
        arr[#arr + 1] = value()
        ws()
        local sep = s:sub(pos, pos)
        pos = pos + 1
        if sep == "]" then return arr end
      end
    elseif c == '"' then
      return str()
    elseif s:sub(pos, pos + 3) == "true" then pos = pos + 4; return true
    elseif s:sub(pos, pos + 4) == "false" then pos = pos + 5; return false
    elseif s:sub(pos, pos + 3) == "null" then pos = pos + 4; return nil
    else
      local num = s:match("^-?%d+%.?%d*[eE]?[-+]?%d*", pos)
      if not num or num == "" then error("unexpected " .. c .. " at " .. pos) end
      pos = pos + #num
      return tonumber(num)
    end
  end
  return value()
end

---------------------------------------------------------------------------------------------------
-- Project
---------------------------------------------------------------------------------------------------

local function newGuid()
  return reaper.genGuid("")
end

-- The project's PostPin id, created on first use. Saved with the project, so Save As keeps it.
local function projectId()
  local _, id = reaper.GetProjExtState(0, PROJECT, "id")
  if id == "" then
    id = newGuid()
    reaper.SetProjExtState(0, PROJECT, "id", id)
  end
  return id
end

local function projectInfo()
  local _, path = reaper.EnumProjects(-1)
  local fps, dropFrame = reaper.TimeMap_curFrameRate(0)
  return {
    id = projectId(),
    path = path or "",
    name = reaper.GetProjectName(0),
    frameRate = fps,
    dropFrame = dropFrame,
    -- seconds: the project's time 0 shows as this time
    offset = reaper.GetProjectTimeOffset(0, false),
    length = reaper.GetProjectLength(0),
  }
end

---------------------------------------------------------------------------------------------------
-- Markers
---------------------------------------------------------------------------------------------------

local function colorHex(native)
  if native == 0 then return json.null end
  local r, g, b = reaper.ColorFromNative(native & 0xFFFFFF)
  return string.format("#%02x%02x%02x", r, g, b)
end

local function nativeColor(hex)
  if type(hex) ~= "string" or not hex:match("^#%x%x%x%x%x%x$") then return 0 end
  local r, g, b = tonumber(hex:sub(2, 3), 16), tonumber(hex:sub(4, 5), 16), tonumber(hex:sub(6, 7), 16)
  return reaper.ColorToNative(r, g, b) | 0x1000000
end

local function markerData(guid)
  local _, raw = reaper.GetProjExtState(0, MARKER_DATA, guid)
  if raw == "" then return {} end
  local ok, data = pcall(json.decode, raw)
  return ok and type(data) == "table" and data or {}
end

local function setMarkerData(guid, description, customData)
  if (description or "") == "" and customData == nil then
    reaper.SetProjExtState(0, MARKER_DATA, guid, "")
  else
    reaper.SetProjExtState(0, MARKER_DATA, guid, json.encode({ description = description or "", customData = customData }))
  end
end

local function guidAt(index)
  local _, guid = reaper.GetSetProjectInfo_String(0, "MARKER_GUID:" .. index, "", false)
  return guid
end

-- The enumeration index of a marker, nil when it's gone
local function indexOf(guid)
  if type(guid) ~= "string" or guid == "" then return nil end
  local ok, index = reaper.GetSetProjectInfo_String(0, "MARKER_INDEX_FROM_GUID:" .. guid, "", false)
  if not ok or index == "" then return nil end
  return tonumber(index)
end

local function listMarkers()
  local out = json.arr()
  local _, markers, regions = reaper.CountProjectMarkers(0)
  for i = 0, markers + regions - 1 do
    local _, isRegion, start, finish, name, number, color = reaper.EnumProjectMarkers3(0, i)
    local guid = guidAt(i)
    local data = markerData(guid)
    out[#out + 1] = {
      guid = guid,
      isRegion = isRegion,
      start = start,
      ["end"] = finish,
      name = name,
      number = number,
      color = colorHex(color),
      description = data.description or "",
      customData = data.customData,
    }
  end
  return out
end

-- Adds a marker or region and returns its GUID
local function addMarker(m)
  local isRegion = m["end"] ~= nil and m["end"] > m.start
  local number = reaper.AddProjectMarker2(0, isRegion, m.start, isRegion and m["end"] or 0, m.name, -1, nativeColor(m.color))
  if number < 0 then error("REAPER didn't add the marker") end
  local _, markers, regions = reaper.CountProjectMarkers(0)
  for i = markers + regions - 1, 0, -1 do
    local _, r, _, _, _, n = reaper.EnumProjectMarkers3(0, i)
    if r == isRegion and n == number then return guidAt(i) end
  end
  error("REAPER added the marker but it isn't there")
end

local function deleteAt(index)
  if not reaper.DeleteProjectMarkerByIndex(0, index) then error("REAPER didn't delete the marker") end
end

-- Each marker: guid (to update, nil to add), name, description, customData, start, end (nil keeps
-- an existing one's length, nil or equal to start for a point marker), color ("#rrggbb" or nil)
local function setMarkers(list)
  local results = json.arr()
  for i = 1, #list do
    local m = list[i]
    local ok, result = pcall(function()
      local index = indexOf(m.guid)
      local guid
      if index then
        local _, isRegion, pos, finish, _, number = reaper.EnumProjectMarkers3(0, index)
        -- no end: a range keeps its length
        if m["end"] == nil and isRegion then m["end"] = m.start + (finish - pos) end
        local wantsRegion = m["end"] ~= nil and m["end"] > m.start
        if wantsRegion == isRegion then
          local color = nativeColor(m.color)
          reaper.SetProjectMarkerByIndex2(0, index, isRegion, m.start, isRegion and m["end"] or 0, number, m.name, color, m.name == "" and 1 or 0)
          guid = m.guid
        else
          -- a point marker that became a range or back: REAPER can't change the kind, so it's a new one
          deleteAt(index)
          setMarkerData(m.guid, nil, nil)
          guid = addMarker(m)
        end
      else
        guid = addMarker(m)
      end
      setMarkerData(guid, m.description, m.customData)
      return guid
    end)
    results[#results + 1] = ok and { guid = result } or { error = tostring(result) }
  end
  return results
end

local function removeMarkers(guids)
  local failed = 0
  for i = 1, #guids do
    local index = indexOf(guids[i])
    if index then
      if reaper.DeleteProjectMarkerByIndex(0, index) then
        setMarkerData(guids[i], nil, nil)
      else
        failed = failed + 1
      end
    end
  end
  if failed > 0 then error("REAPER didn't delete " .. failed .. " markers") end
  return json.null
end

local function clearMarkers()
  local _, markers, regions = reaper.CountProjectMarkers(0)
  for i = markers + regions - 1, 0, -1 do
    setMarkerData(guidAt(i), nil, nil)
    reaper.DeleteProjectMarkerByIndex(0, i)
  end
  return json.null
end

---------------------------------------------------------------------------------------------------
-- Timeline snapshot
---------------------------------------------------------------------------------------------------

local function snapshot()
  local tracks = json.arr()
  for t = 0, reaper.CountTracks(0) - 1 do
    local track = reaper.GetTrack(0, t)
    local _, name = reaper.GetTrackName(track)
    local items = json.arr()
    local hasVideo = false
    for i = 0, reaper.CountTrackMediaItems(track) - 1 do
      local item = reaper.GetTrackMediaItem(track, i)
      if reaper.GetMediaItemInfo_Value(item, "B_MUTE") == 0 then
        local take = reaper.GetActiveTake(item)
        local file, sourceType, takeName, offset, rate = json.null, "", "", 0, 1
        if take then
          takeName = reaper.GetTakeName(take)
          offset = reaper.GetMediaItemTakeInfo_Value(take, "D_STARTOFFS")
          rate = reaper.GetMediaItemTakeInfo_Value(take, "D_PLAYRATE")
          local source = reaper.GetMediaItemTake_Source(take)
          -- sections and reversed sources wrap the file's source
          local parent = reaper.GetMediaSourceParent(source)
          while parent do
            source = parent
            parent = reaper.GetMediaSourceParent(source)
          end
          sourceType = reaper.GetMediaSourceType(source, "")
          local path = reaper.GetMediaSourceFileName(source, "")
          if path ~= "" then file = path end
          if sourceType == "VIDEO" then hasVideo = true end
        end
        local _, guid = reaper.GetSetMediaItemInfo_String(item, "GUID", "", false)
        local color = reaper.GetMediaItemInfo_Value(item, "I_CUSTOMCOLOR")
        items[#items + 1] = {
          guid = guid,
          name = takeName,
          start = reaper.GetMediaItemInfo_Value(item, "D_POSITION"),
          length = reaper.GetMediaItemInfo_Value(item, "D_LENGTH"),
          sourceOffset = offset,
          rate = rate,
          file = file,
          sourceType = sourceType,
          color = colorHex(math.floor(color)),
        }
      end
    end
    local _, guid = reaper.GetSetMediaTrackInfo_String(track, "GUID", "", false)
    tracks[#tracks + 1] = { guid = guid, name = name, hasVideo = hasVideo, items = items }
  end
  return { project = projectInfo(), tracks = tracks }
end

---------------------------------------------------------------------------------------------------
-- Render
---------------------------------------------------------------------------------------------------

local RENDER_STRINGS = { "RENDER_FILE", "RENDER_PATTERN", "RENDER_FORMAT", "RENDER_FORMAT2" }
local RENDER_VALUES = { "RENDER_SETTINGS", "RENDER_BOUNDSFLAG", "RENDER_STARTPOS", "RENDER_ENDPOS", "RENDER_TAILFLAG", "RENDER_ADDTOPROJ", "RENDER_DITHER", "RENDER_SRATE", "RENDER_CHANNELS" }

-- Renders the whole project into folder/name with the given sink configuration (base64), then puts
-- the user's render settings back. REAPER is busy meanwhile: the HTTP request returns when done.
local function render(params)
  local saved = {}
  for _, key in ipairs(RENDER_STRINGS) do
    saved[key] = select(2, reaper.GetSetProjectInfo_String(0, key, "", false))
  end
  for _, key in ipairs(RENDER_VALUES) do
    saved[key] = reaper.GetSetProjectInfo(0, key, 0, false)
  end
  local ok, result = pcall(function()
    reaper.GetSetProjectInfo_String(0, "RENDER_FILE", params.folder, true)
    reaper.GetSetProjectInfo_String(0, "RENDER_PATTERN", params.name, true)
    reaper.GetSetProjectInfo_String(0, "RENDER_FORMAT", params.format, true)
    reaper.GetSetProjectInfo_String(0, "RENDER_FORMAT2", "", true)
    reaper.GetSetProjectInfo(0, "RENDER_SETTINGS", 0, true) -- master mix
    reaper.GetSetProjectInfo(0, "RENDER_BOUNDSFLAG", 1, true) -- entire project
    reaper.GetSetProjectInfo(0, "RENDER_TAILFLAG", 0, true)
    reaper.GetSetProjectInfo(0, "RENDER_ADDTOPROJ", 0, true)
    reaper.GetSetProjectInfo(0, "RENDER_SRATE", 48000, true)
    reaper.GetSetProjectInfo(0, "RENDER_CHANNELS", 2, true)
    local _, targets = reaper.GetSetProjectInfo_String(0, "RENDER_TARGETS", "", false)
    -- File: Render project, using the most recent render settings, auto-close render dialog
    reaper.Main_OnCommand(42230, 0)
    return targets
  end)
  for _, key in ipairs(RENDER_STRINGS) do reaper.GetSetProjectInfo_String(0, key, saved[key], true) end
  for _, key in ipairs(RENDER_VALUES) do reaper.GetSetProjectInfo(0, key, saved[key], true) end
  if not ok then error(result) end
  return { targets = result }
end

---------------------------------------------------------------------------------------------------
-- Request
---------------------------------------------------------------------------------------------------

local commands = {
  ping = function() return { version = reaper.GetAppVersion(), bridge = 1 } end,
  project = projectInfo,
  markers = listMarkers,
  setMarkers = setMarkers,
  removeMarkers = removeMarkers,
  clearMarkers = clearMarkers,
  snapshot = snapshot,
  render = render,
}

-- Undo points: changes to markers are one undo step each request
local UNDO = { setMarkers = "PostPin: markers", removeMarkers = "PostPin: remove markers", clearMarkers = "PostPin: remove markers" }

local function readFile(path)
  local f = assert(io.open(path, "rb"))
  local content = f:read("a")
  f:close()
  return content
end

local function writeFile(path, content)
  local f = assert(io.open(path, "wb"))
  f:write(content)
  f:close()
end

local hex = reaper.GetExtState(SECTION, "req")
local path = hex:gsub("%x%x", function(h) return string.char(tonumber(h, 16)) end)
if path ~= "" then
  local ok, result = pcall(function()
    local request = json.decode(readFile(path))
    local command = commands[request.command]
    if not command then error("PostPin bridge has no command " .. tostring(request.command)) end
    local undo = UNDO[request.command]
    if undo then reaper.Undo_BeginBlock2(0) end
    local okRun, value = pcall(command, request.params)
    if undo then
      reaper.Undo_EndBlock2(0, undo, -1)
      reaper.UpdateTimeline()
    end
    if not okRun then error(value, 0) end
    return value
  end)
  local response
  if ok then
    response = json.encode({ ok = true, result = result })
  else
    response = json.encode({ ok = false, error = tostring(result) })
  end
  writeFile(path .. ".out", response)
end
