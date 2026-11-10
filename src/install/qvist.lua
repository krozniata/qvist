local KEY = "shift+cmd+k"
local TERM = "com.superlogical.terminal"

local function must(res, err)
  if err ~= nil then error(err, 0) end
  return res
end

-- panes lists the session's terminal blocks running qvist.
local function panes()
  local ids = {}
  for _, b in ipairs(must(rex.session.list_blocks{}).blocks or {}) do
    if b.creator_name == TERM then
      local p = rex.block.call(TERM, "process", { block_id = b.block_id })
      if p and p.foreground and p.foreground.name == "qvist" then
        table.insert(ids, b.block_id)
      end
    end
  end
  return ids
end

rex.action{
  name = "qvist_toggle",
  title = "Toggle qvist",
  description = "Show the git changes of this pane's repository in a pane beside it",
  category = "qvist",
  keywords = "git source control changes diff commit stage branch history config",
  run = function(ctx)
    local open = panes()
    if #open > 0 then
      for _, id in ipairs(open) do
        must(rex.call("block.close", { session_id = ctx.session_id, block_id = id }))
      end
      return { closed = open }
    end
    -- qvist opens the repository of the pane it was asked from.
    local cwd = nil
    local p = rex.block.call(TERM, "process", { block_id = ctx.block_id })
    -- The foreground process's directory, else the shell's under it.
    if p then
      cwd = (p.foreground and p.foreground.cwd) or (p.ancestors and p.ancestors[1] and p.ancestors[1].cwd)
    end
    return must(rex.session.new_split{
      anchor_id = ctx.block_id,
      direction = "horizontal",
      side = "after",
      ratio = 0.5,
      focus = true,
      layout = rex.layout.block{
        flavor = TERM .. ".shell",
        label = "qvist",
        options = { command = { BIN, cwd or "." } },
      },
    })
  end,
}
rex.bind(KEY, "qvist_toggle")
