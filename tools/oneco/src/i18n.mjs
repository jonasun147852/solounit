const ENGLISH = "en";
const CHINESE = "zh";
const SUPPORTED_LOCALES = new Set([ENGLISH, CHINESE]);

export const strings = Object.freeze({
  en: Object.freeze({
    "mirror.doctor": "Doctor",
    "mirror.wallet": "Wallet",
    "mirror.audit": "Audit",
    "mirror.cognition": "Cognition",
    "help.text": `SoloUnit — private mirrors for agent power-users

Usage:
  solounit doctor [--json]
  solounit audit [--json]
  solounit wallet [--days 30] [--agent claude|codex] [--json]
  solounit wallet [--days 30] [--agent claude|codex] --html [path]
  solounit dashboard [--out path] [--open]
  solounit graft [--days 30] [--agent claude|codex] [--debug]
  solounit sync [--url http://localhost:8787]

Global options:
  --lang <en|zh>  Override the system language.

Commands:
  doctor  Match this environment against bundled and cached advisories offline.
  audit   Review local agent access, hooks, credentials, and permissions offline.
  wallet  Report API-equivalent agent usage and potential savings from local logs.
  dashboard  Render all local mirrors as a self-contained visual health panel.
  graft   Run doctor, wallet, and audit together for the first-run experience.
  sync    Explicitly fetch advisories and update the local cache.

Trust: only an explicit sync command can use the network. Doctor, audit, wallet, dashboard, and graft stay offline.
`,
    "cli.langInvalid": "--lang must be en or zh",
    "cli.htmlPathEmpty": "--html path cannot be empty",
    "cli.urlRequired": "--url requires a value",
    "cli.outRequired": "--out requires a value",
    "cli.unknownOption": "Unknown option: {option}",
    "cli.daysRange": "--days must be an integer from 1 to 3650",
    "cli.agentRequired": "--agent requires claude or codex",
    "cli.agentInvalid": "--agent must be claude or codex",
    "cli.outputConflict": "--json and --html cannot be used together",
    "cli.unknownCommand": "Unknown command: {command}",
    "graft.advisory.one": "local setup advisory",
    "graft.advisory.other": "local setup advisories",
    "graft.complete": "Graft complete: Doctor matched {matched} {advisoryLabel}. Wallet reports {spend} in API-equivalent usage and up to {waste} in potential savings if optimized; all analysis stayed on this machine.",
    "graft.auditSummary": "{mirror} — {critical} critical, {warning} warning, {info} info.{ending}",
    "graft.auditDetails": " Run solounit audit for detail.",
    "graft.auditClear": " No findings.",
    "graft.auditReviewedClear": "Reviewed {servers} MCP servers / {files} config files, nothing risky found.",
    "graft.auditReviewed": "Reviewed {servers} MCP servers / {files} config files; {findings} findings are available in `solounit audit`.",
    "graft.doctorError": "Doctor could not inspect your environment: {reason}. Run `solounit doctor` for details.",
    "graft.walletError": "Wallet could not read your logs: {reason}. Run `solounit wallet` for details.",
    "graft.auditError": "Audit could not inspect your local configuration: {reason}. Run `solounit audit` for details.",
    "graft.unknownError": "unknown internal error",
    "graft.none": "none",
    "graft.debug": "[debug] {mirror}: directories checked: {directories}; files found: {files}; lines parsed: {parsed}; lines skipped: {skipped}.",
    "graft.dashboardPrompt": "Run `solounit dashboard --open` to see all of this as a visual panel.",
    "sync.noUrl": "No advisory hub URL is configured. Run `solounit sync --url http://localhost:8787` or set SOLOUNIT_HUB_URL.",
    "sync.httpFailure": "Advisory sync failed with HTTP {status}.",
    "sync.invalidJson": "Advisory sync returned invalid JSON.",
    "sync.complete.one": "Fetched {count} advisory. Advisory cache last updated {updatedAt}.",
    "sync.complete.other": "Fetched {count} advisories. Advisory cache last updated {updatedAt}.",
    "validation.identifier": "must be a valid advisory identifier",
    "validation.lowercaseSlug": "must be a lowercase slug",
    "validation.status": "must be draft, published, or withdrawn",
    "validation.trigger": "must be environment or event",
    "validation.array": "must be an array",
    "validation.maxEntries": "must contain no more than 10000 entries",
    "validation.url": "--url must be a valid http:// or https:// base URL",
    "validation.urlProtocol": "--url must use http:// or https://",
    "validation.urlCredentials": "--url must not contain credentials",
    "validation.object": "must be an object",
    "validation.unsupportedFields": "contains unsupported field(s): {fields}",
    "validation.trimmedString": "must be a trimmed string containing {min}-{max} characters",
    "validation.itemRange": "must contain {min}-{max} items",
    "validation.dateFormat": "must use YYYY-MM-DD format",
    "validation.validDate": "must be a valid calendar date",
    "validation.timestamp": "must be an ISO-8601 timestamp",
    "validation.invalidData": "Invalid advisory data at {path}: {message}.",
    "doctor.localReport": "Local-only environment report — nothing leaves this machine.",
    "doctor.environment": "Claude Code {claude} · Codex {codex} · Node {node} · {platform}/{arch}",
    "doctor.notFound": "not found",
    "doctor.detected": "detected from local logs",
    "doctor.matchCount": "{matched} of {scanned} local advisories matched.",
    "doctor.scannedFingerprint": "Scanned {scanned} advisories against your fingerprint (claude {claude}, codex {codex}, {platform}).",
    "doctor.noMatches": "Nothing known-broken in your setup right now — that is the good outcome. The cost and access reports below are where the interesting numbers usually are.",
    "doctor.draft": "DRAFT",
    "doctor.evidence": "Evidence: {value}",
    "doctor.source": "Source: {value}",
    "doctor.fix": "Fix:",
    "doctor.scanErrors": "Note: {count} optional configuration file(s) could not be parsed.",
    "doctor.error": "The local environment report could not be completed.",
    "agent.claude": "Claude Code",
    "agent.codex": "Codex",
    "wallet.usageLabel": "API-equivalent usage",
    "wallet.usageExplainer": "What this usage would cost at API list prices — subscription users: this is what your plan absorbed, not your bill.",
    "wallet.savingsLabel": "Potential savings if optimized",
    "wallet.retryLabel": "Retry storms (estimate)",
    "wallet.retryEvidence": "{bursts} burst(s), {attempts} retry record(s) within two-minute windows.",
    "wallet.retryFix": "Pause after repeated API errors and resume with one request after recovery.",
    "wallet.contextLabel": "Context bloat (estimate)",
    "wallet.contextEvidence": "{sessions} top-decile session(s); median {median} vs P90 {p90} input tokens/turn.",
    "wallet.contextFix": "Start a fresh session or compact before repeatedly carrying oversized context.",
    "wallet.tierLabel": "Tier mismatch (estimate)",
    "wallet.tierEvidence": "{turns} short tool-call turn(s) in {sessions} long session(s) used the largest priced tier.",
    "wallet.tierFix": "Route repetitive, low-output tool work to the next smaller model tier.",
    "wallet.estimateNote": "Potential-savings figures are overlapping heuristics, not billing facts; the combined estimate is capped at API-equivalent usage.",
    "wallet.localReport": "Local-only cost report — transcript content is never printed or transmitted.",
    "wallet.combinedUsageLabel": "Combined API-equivalent usage",
    "wallet.byAgent": "By agent:",
    "wallet.agentHeading": "{agent}",
    "wallet.agentSummary": "API-equivalent usage: {spend} · {turns} turns · {sessions} sessions.",
    "wallet.periodSummary": "Last {days} day(s): {turns} assistant turns across {sessions} sessions.",
    "wallet.providedLogs": "provided log data",
    "wallet.noSessionsAtPaths": "Checked these paths: {paths}. Found no session logs there.",
    "wallet.noPricedTurnsAtPaths": "Checked these paths: {paths}. Saw {files} session log file(s), but parsed zero priced turns.",
    "wallet.unpricedTokens": "{tokens} tokens used unknown models and remain unpriced.",
    "wallet.spendByModel": "Spend by model:",
    "wallet.noUsage": "No usage-bearing turns found.",
    "wallet.unpriced": "unpriced",
    "wallet.modelRow": "{model}: {price} · {tokens} tokens · {turns} turns",
    "wallet.wasteHeading": "Top waste buckets (all estimates; buckets can overlap):",
    "wallet.fix": "Fix: {fix}",
    "wallet.savingsSummary": "{label} (capped at API-equivalent usage): {amount}.",
    "wallet.unknownDate": "Unknown date",
    "wallet.cardTitle": "SoloUnit wallet card",
    "wallet.cardEyebrow": "SoloUnit wallet",
    "wallet.cardPeriod": "Last {days} days · {from} – {to}",
    "wallet.cardSpendHeading": "Spend by model",
    "wallet.cardWasteHeading": "Waste buckets · estimates",
    "wallet.cardFooter": "generated locally by SoloUnit — nothing left this machine",
    "wallet.written": "Wallet card written to {path}",
    "wallet.error": "The local wallet report could not be completed.",
    "audit.kind.anthropic": "Anthropic key",
    "audit.kind.openai": "OpenAI project key",
    "audit.kind.aws": "AWS access key",
    "audit.kind.github": "GitHub personal access token",
    "audit.kind.slack": "Slack token",
    "audit.kind.bearer": "Bearer token",
    "audit.shortValue": "short value",
    "audit.credentialLength": "{prefix} (length {length})",
    "audit.scanWhat": "A configured audit location could not be inspected",
    "audit.scanFix": "Check that the path is a regular readable file and retry the audit.",
    "audit.symlinkReason": "Symlinks are not followed so the scan cannot escape its documented locations.",
    "audit.notReadableReason": "The location is not a readable regular file.",
    "audit.readFailedReason": "The regular file could not be read.",
    "audit.invalidJsonWhat": "A configuration file contains invalid JSON",
    "audit.invalidJsonWhy": "Malformed configuration cannot be checked for risky access.",
    "audit.invalidJsonFix": "Repair the JSON and run solounit audit again.",
    "audit.projectListReason": "A project directory could not be listed during the bounded scan.",
    "audit.hookNetworkReason": "it invokes network-capable executable(s): {executables}",
    "audit.hookOutsideReason": "it references a path outside the user home",
    "audit.hookWhat": "Hook command: {command}",
    "audit.hookRiskyWhy": "This hook runs automatically and {reasons}.",
    "audit.hookSafeWhy": "Hooks run automatically with the agent's local access.",
    "audit.hookRiskyFix": "Disable the hook until its command and destination are explicitly trusted.",
    "audit.hookSafeFix": "Keep the hook only while its command and target remain expected.",
    "audit.permissionShellReason": "it allows every shell command",
    "audit.permissionRemovalReason": "it broadly allows destructive file removal",
    "audit.permissionNetworkCommandReason": "it broadly allows a network-capable command",
    "audit.permissionWildcardNetworkReason": "it grants wildcard network access",
    "audit.permissionWhat": "Broad permission allowlist entry: {permission}",
    "audit.permissionWhy": "The allowlist bypasses per-command approval because {reason}.",
    "audit.permissionFix": "Replace the wildcard with the smallest exact command pattern that is required.",
    "audit.credentialWhat": "Plaintext {kind} — {preview}",
    "audit.credentialWhy": "A local process or copied configuration could expose this credential.",
    "audit.credentialFix": "Revoke and rotate it, then store the replacement in a scoped secret manager.",
    "audit.worldReadable": "world-readable",
    "audit.groupReadable": "group-readable",
    "audit.modeWhat": "Credential candidate file is {audience}",
    "audit.modeWhy": "Other local accounts may be able to read credentials stored in this file.",
    "audit.modeFix": "Restrict the mode to the owner only, for example: chmod 600 {path}",
    "audit.registryLoadReason": "The bundled known-bad registry could not be loaded.",
    "audit.knownBadWhat": "Known-bad {kind} matched {id}: {name}",
    "audit.knownBadFix": "Disable or remove it, then review the registry source: {source}",
    "audit.inventoryWhat": "Configured {kind}: {name}",
    "audit.inventoryWhy": "Installed agent integrations inherit access from their local configuration.",
    "audit.inventoryFix": "Remove or disable it if the name, source, or granted access is unexpected.",
    "audit.localReport": "Local-only access report — no network requests were made.",
    "audit.reviewedClear": "Reviewed {servers} MCP servers / {files} config files, nothing risky found.",
    "audit.severity.critical": "CRITICAL",
    "audit.severity.warning": "WARNING",
    "audit.severity.info": "INFO",
    "audit.none": "None.",
    "audit.where": "Where: {where}",
    "audit.why": "Why: {why}",
    "audit.fix": "Fix: {fix}",
    "audit.summary": "{critical} critical · {warning} warning · {info} info · {total} total — everything stayed on this machine.",
    "audit.failedWhat": "The local audit could not be completed",
    "audit.failedWhere": "documented local audit locations",
    "audit.failedWhy": "An internal failure prevented a complete access review.",
    "audit.failedFix": "Retry the command; if it repeats, inspect the local SoloUnit installation.",
    "dashboard.unknownTime": "Unknown time",
    "dashboard.noFixSteps": "No fix steps supplied.",
    "dashboard.advisory": "Advisory",
    "dashboard.matchedEnvironment": "Matched this local environment.",
    "dashboard.fix": "Fix",
    "dashboard.noAdvisories": "No local advisories matched this environment.",
    "dashboard.environmentHealth": "Environment health",
    "dashboard.matchedCount": "{count} matched",
    "dashboard.unpriced": "Unpriced",
    "dashboard.unknownModel": "Unknown model",
    "dashboard.noUsage": "No usage-bearing turns found.",
    "dashboard.estimate": "Estimate",
    "dashboard.noSavings": "No potential-savings estimates found.",
    "dashboard.costVisibility": "Cost visibility",
    "dashboard.days": "{count} days",
    "dashboard.spendByModel": "Spend by model",
    "dashboard.wasteHeading": "Top waste buckets",
    "dashboard.estimates": "estimates",
    "dashboard.finding": "Finding",
    "dashboard.localAuditFinding": "Local audit finding",
    "dashboard.where": "Where",
    "dashboard.notSpecified": "Not specified",
    "dashboard.fixLabel": "Fix",
    "dashboard.reviewConfig": "Review this local configuration.",
    "dashboard.allClear": "All clear — no audit findings.",
    "dashboard.noUrgentFindings": "No critical or warning findings.",
    "dashboard.localAccessReview": "Local access review",
    "dashboard.total": "{count} total",
    "dashboard.trafficAria": "{critical} critical, {warning} warning, {info} info findings",
    "dashboard.critical": "Critical",
    "dashboard.warning": "Warning",
    "dashboard.info": "Info",
    "dashboard.thinkingPatterns": "Thinking patterns",
    "dashboard.comingSoon": "Coming soon",
    "dashboard.cognitionPlaceholder": "The cognition mirror is not implemented yet. This space is reserved for its local summary.",
    "dashboard.localSummary": "Local summary",
    "dashboard.title": "SoloUnit — local health panel",
    "dashboard.brand": "SoloUnit — local health panel",
    "dashboard.generated": "Generated {time}",
    "dashboard.trust": "Everything on this page was computed locally. Nothing left this machine.",
    "dashboard.footer": "SoloUnit local health panel · generated for this machine only",
    "dashboard.written": "Dashboard written to {path}",
    "dashboard.opened": "Opened {path}",
  }),
  zh: Object.freeze({
    "mirror.doctor": "修理镜 · Doctor",
    "mirror.wallet": "钱包镜 · Wallet",
    "mirror.audit": "安全镜 · Audit",
    "mirror.cognition": "认知镜 · Cognition",
    "help.text": `SoloUnit — 面向智能体高级用户的隐私镜像

用法：
  solounit doctor [--json]
  solounit audit [--json]
  solounit wallet [--days 30] [--agent claude|codex] [--json]
  solounit wallet [--days 30] [--agent claude|codex] --html [path]
  solounit dashboard [--out path] [--open]
  solounit graft [--days 30] [--agent claude|codex] [--debug]
  solounit sync [--url http://localhost:8787]

全局选项：
  --lang <en|zh>  覆盖系统语言。

命令：
  doctor  离线将当前环境与内置及缓存的建议进行匹配。
  audit   离线检查本地智能体访问、钩子、凭据和权限。
  wallet  基于本地日志报告智能体的 API 等效用量和潜在节省。
  dashboard  将所有本地镜像渲染为独立的可视化健康面板。
  graft   为首次使用同时运行修理镜、钱包镜和安全镜。
  sync    显式获取建议并更新本地缓存。

信任说明：只有显式执行 sync 命令才会使用网络。修理镜、安全镜、钱包镜、面板和 graft 始终离线运行。
`,
    "cli.langInvalid": "--lang 必须是 en 或 zh",
    "cli.htmlPathEmpty": "--html 路径不能为空",
    "cli.urlRequired": "--url 需要一个值",
    "cli.outRequired": "--out 需要一个值",
    "cli.unknownOption": "未知选项：{option}",
    "cli.daysRange": "--days 必须是 1 到 3650 之间的整数",
    "cli.agentRequired": "--agent 需要 claude 或 codex",
    "cli.agentInvalid": "--agent 必须是 claude 或 codex",
    "cli.outputConflict": "--json 和 --html 不能同时使用",
    "cli.unknownCommand": "未知命令：{command}",
    "graft.advisory.one": "条本地设置建议",
    "graft.advisory.other": "条本地设置建议",
    "graft.complete": "Graft 完成：修理镜匹配了 {matched} {advisoryLabel}。钱包镜报告的 API 等效用量为 {spend}，优化后最多可节省 {waste}；所有分析均留在本机。",
    "graft.auditSummary": "{mirror} — {critical} 个严重项、{warning} 个警告、{info} 个信息项。{ending}",
    "graft.auditDetails": "运行 solounit audit 查看详情。",
    "graft.auditClear": "没有发现问题。",
    "graft.auditReviewedClear": "检查了 {servers} 个 MCP 服务器和 {files} 个配置文件；未发现风险。",
    "graft.auditReviewed": "检查了 {servers} 个 MCP 服务器和 {files} 个配置文件；可在 `solounit audit` 中查看 {findings} 个发现。",
    "graft.doctorError": "修理镜无法检查你的环境：{reason}。运行 `solounit doctor` 查看详情。",
    "graft.walletError": "钱包镜无法读取本地日志：{reason}。运行 `solounit wallet` 查看详情。",
    "graft.auditError": "安全镜无法检查本地配置：{reason}。运行 `solounit audit` 查看详情。",
    "graft.unknownError": "未知内部错误",
    "graft.none": "无",
    "graft.debug": "[调试] {mirror}：已检查目录：{directories}；找到文件：{files}；已解析行：{parsed}；已跳过行：{skipped}。",
    "graft.dashboardPrompt": "运行 `solounit dashboard --open` 在可视化面板中查看全部结果。",
    "sync.noUrl": "未配置建议中心 URL。请运行 `solounit sync --url http://localhost:8787` 或设置 SOLOUNIT_HUB_URL。",
    "sync.httpFailure": "建议同步失败，HTTP 状态码为 {status}。",
    "sync.invalidJson": "建议同步返回了无效 JSON。",
    "sync.complete.one": "已获取 {count} 条建议。建议缓存最后更新于 {updatedAt}。",
    "sync.complete.other": "已获取 {count} 条建议。建议缓存最后更新于 {updatedAt}。",
    "validation.identifier": "必须是有效的建议标识符",
    "validation.lowercaseSlug": "必须是小写 slug",
    "validation.status": "必须是 draft、published 或 withdrawn",
    "validation.trigger": "必须是 environment 或 event",
    "validation.array": "必须是数组",
    "validation.maxEntries": "不得超过 10000 条",
    "validation.url": "--url 必须是有效的 http:// 或 https:// 基础 URL",
    "validation.urlProtocol": "--url 必须使用 http:// 或 https://",
    "validation.urlCredentials": "--url 不得包含凭据",
    "validation.object": "必须是对象",
    "validation.unsupportedFields": "包含不支持的字段：{fields}",
    "validation.trimmedString": "必须是已去除首尾空白且长度为 {min}-{max} 的字符串",
    "validation.itemRange": "必须包含 {min}-{max} 项",
    "validation.dateFormat": "必须使用 YYYY-MM-DD 格式",
    "validation.validDate": "必须是有效的日期",
    "validation.timestamp": "必须是 ISO-8601 时间戳",
    "validation.invalidData": "建议数据无效，位置 {path}：{message}。",
    "doctor.localReport": "仅本地环境报告 — 没有任何数据离开本机。",
    "doctor.environment": "Claude Code {claude} · Codex {codex} · Node {node} · {platform}/{arch}",
    "doctor.notFound": "未找到",
    "doctor.detected": "从本地日志检测到",
    "doctor.matchCount": "{scanned} 条本地建议中有 {matched} 条匹配。",
    "doctor.scannedFingerprint": "已根据你的指纹（claude {claude}、codex {codex}、{platform}）扫描 {scanned} 条建议。",
    "doctor.noMatches": "你的环境目前没有已知故障——这是好结果。真正有料的数字通常在下面的用量和权限报告里。",
    "doctor.draft": "草稿",
    "doctor.evidence": "证据：{value}",
    "doctor.source": "来源：{value}",
    "doctor.fix": "修复步骤：",
    "doctor.scanErrors": "注意：有 {count} 个可选配置文件无法解析。",
    "doctor.error": "无法完成本地环境报告。",
    "agent.claude": "Claude Code",
    "agent.codex": "Codex",
    "wallet.usageLabel": "API 等效用量",
    "wallet.usageExplainer": "按 API 定价计算这些用量的价值 — 对订阅用户而言，这是套餐吸收的用量，不是您的账单。",
    "wallet.savingsLabel": "优化后潜在节省",
    "wallet.retryLabel": "重试风暴（估算）",
    "wallet.retryEvidence": "两分钟窗口内有 {bursts} 个突发组、{attempts} 条重试记录。",
    "wallet.retryFix": "API 反复报错后先暂停，恢复后只发送一个请求。",
    "wallet.contextLabel": "上下文膨胀（估算）",
    "wallet.contextEvidence": "{sessions} 个前十分位会话；输入 token/轮的中位数为 {median}，P90 为 {p90}。",
    "wallet.contextFix": "在反复携带过大上下文之前，开始新会话或进行压缩。",
    "wallet.tierLabel": "模型层级不匹配（估算）",
    "wallet.tierEvidence": "{sessions} 个长会话中的 {turns} 个短工具调用轮使用了定价最高的层级。",
    "wallet.tierFix": "将重复、低输出的工具工作路由到下一个更小的模型层级。",
    "wallet.estimateNote": "潜在节省数字是可能重叠的启发式估算，而非账单事实；合计估算不超过 API 等效用量。",
    "wallet.localReport": "仅本地成本报告 — 绝不打印或传输对话内容。",
    "wallet.combinedUsageLabel": "合计 API 等效用量",
    "wallet.byAgent": "按智能体：",
    "wallet.agentHeading": "{agent}",
    "wallet.agentSummary": "API 等效用量：{spend} · {turns} 轮 · {sessions} 个会话。",
    "wallet.periodSummary": "过去 {days} 天：{sessions} 个会话中共有 {turns} 个助手轮次。",
    "wallet.providedLogs": "提供的日志数据",
    "wallet.noSessionsAtPaths": "已检查这些路径：{paths}。其中未找到会话日志。",
    "wallet.noPricedTurnsAtPaths": "已检查这些路径：{paths}。看到 {files} 个会话日志文件，但解析出的可定价轮次为零。",
    "wallet.unpricedTokens": "未知模型使用了 {tokens} 个 token，尚未定价。",
    "wallet.spendByModel": "按模型划分的用量：",
    "wallet.noUsage": "未找到包含用量的轮次。",
    "wallet.unpriced": "未定价",
    "wallet.modelRow": "{model}：{price} · {tokens} 个 token · {turns} 轮",
    "wallet.wasteHeading": "主要浪费项（均为估算，各项可能重叠）：",
    "wallet.fix": "修复：{fix}",
    "wallet.savingsSummary": "{label}（不超过 API 等效用量）：{amount}。",
    "wallet.unknownDate": "未知日期",
    "wallet.cardTitle": "SoloUnit 钱包卡片",
    "wallet.cardEyebrow": "钱包镜 · Wallet",
    "wallet.cardPeriod": "过去 {days} 天 · {from} – {to}",
    "wallet.cardSpendHeading": "按模型划分的用量",
    "wallet.cardWasteHeading": "浪费项 · 估算",
    "wallet.cardFooter": "由 SoloUnit 在本地生成 — 没有任何数据离开本机",
    "wallet.written": "钱包卡片已写入 {path}",
    "wallet.error": "无法完成本地钱包报告。",
    "audit.kind.anthropic": "Anthropic 密钥",
    "audit.kind.openai": "OpenAI 项目密钥",
    "audit.kind.aws": "AWS 访问密钥",
    "audit.kind.github": "GitHub 个人访问令牌",
    "audit.kind.slack": "Slack 令牌",
    "audit.kind.bearer": "Bearer 令牌",
    "audit.shortValue": "短值",
    "audit.credentialLength": "{prefix}（长度 {length}）",
    "audit.scanWhat": "无法检查已配置的安全审核位置",
    "audit.scanFix": "检查该路径是否为可读的普通文件，然后重试安全审核。",
    "audit.symlinkReason": "不跟随符号链接，以防扫描逃离指定位置。",
    "audit.notReadableReason": "该位置不是可读的普通文件。",
    "audit.readFailedReason": "无法读取该普通文件。",
    "audit.invalidJsonWhat": "配置文件包含无效 JSON",
    "audit.invalidJsonWhy": "无法检查格式错误的配置是否存在风险访问。",
    "audit.invalidJsonFix": "修复 JSON 后重新运行 solounit audit。",
    "audit.projectListReason": "有一个项目目录在有界扫描中无法列出。",
    "audit.hookNetworkReason": "它调用了具有网络能力的可执行文件：{executables}",
    "audit.hookOutsideReason": "它引用了用户主目录之外的路径",
    "audit.hookWhat": "钩子命令：{command}",
    "audit.hookRiskyWhy": "此钩子会自动运行，且{reasons}。",
    "audit.hookSafeWhy": "钩子会自动使用智能体的本地访问权限运行。",
    "audit.hookRiskyFix": "在明确信任其命令和目标之前禁用该钩子。",
    "audit.hookSafeFix": "只有在其命令和目标仍符合预期时才保留该钩子。",
    "audit.permissionShellReason": "它允许所有 shell 命令",
    "audit.permissionRemovalReason": "它宽泛允许破坏性文件删除",
    "audit.permissionNetworkCommandReason": "它宽泛允许具有网络能力的命令",
    "audit.permissionWildcardNetworkReason": "它授予通配符网络访问权限",
    "audit.permissionWhat": "宽泛的权限允许列表项：{permission}",
    "audit.permissionWhy": "允许列表绕过了逐命令审批，因为{reason}。",
    "audit.permissionFix": "将通配符替换为所需的最小精确命令模式。",
    "audit.credentialWhat": "明文 {kind} — {preview}",
    "audit.credentialWhy": "本地进程或被复制的配置可能暴露此凭据。",
    "audit.credentialFix": "撤销并轮换该凭据，然后将替换项存入限定范围的密密管理器。",
    "audit.worldReadable": "所有用户可读",
    "audit.groupReadable": "同组用户可读",
    "audit.modeWhat": "凭据候选文件为{audience}",
    "audit.modeWhy": "其他本地账户可能能够读取此文件中存储的凭据。",
    "audit.modeFix": "将权限模式限制为仅所有者可读，例如：chmod 600 {path}",
    "audit.registryLoadReason": "无法加载内置的已知不安全注册表。",
    "audit.knownBadWhat": "已知不安全的 {kind} 匹配 {id}：{name}",
    "audit.knownBadFix": "禁用或删除它，然后检查注册表来源：{source}",
    "audit.inventoryWhat": "已配置 {kind}：{name}",
    "audit.inventoryWhy": "已安装的智能体集成会继承其本地配置的访问权限。",
    "audit.inventoryFix": "如果名称、来源或授予的访问权限不符合预期，请删除或禁用它。",
    "audit.localReport": "仅本地访问报告 — 未发出任何网络请求。",
    "audit.reviewedClear": "检查了 {servers} 个 MCP 服务器和 {files} 个配置文件；未发现风险。",
    "audit.severity.critical": "严重",
    "audit.severity.warning": "警告",
    "audit.severity.info": "信息",
    "audit.none": "无。",
    "audit.where": "位置：{where}",
    "audit.why": "原因：{why}",
    "audit.fix": "修复：{fix}",
    "audit.summary": "{critical} 个严重项 · {warning} 个警告 · {info} 个信息项 · 共 {total} 项 — 所有分析均留在本机。",
    "audit.failedWhat": "无法完成本地安全审核",
    "audit.failedWhere": "已记录的本地安全审核位置",
    "audit.failedWhy": "内部故障导致无法完成全面访问审查。",
    "audit.failedFix": "重试该命令；如果问题重复出现，请检查本地 SoloUnit 安装。",
    "dashboard.unknownTime": "未知时间",
    "dashboard.noFixSteps": "未提供修复步骤。",
    "dashboard.advisory": "建议",
    "dashboard.matchedEnvironment": "匹配此本地环境。",
    "dashboard.fix": "修复",
    "dashboard.noAdvisories": "没有本地建议匹配此环境。",
    "dashboard.environmentHealth": "环境健康",
    "dashboard.matchedCount": "匹配 {count} 条",
    "dashboard.unpriced": "未定价",
    "dashboard.unknownModel": "未知模型",
    "dashboard.noUsage": "未找到包含用量的轮次。",
    "dashboard.estimate": "估算",
    "dashboard.noSavings": "未找到潜在节省估算。",
    "dashboard.costVisibility": "成本可见性",
    "dashboard.days": "{count} 天",
    "dashboard.spendByModel": "按模型划分的用量",
    "dashboard.wasteHeading": "主要浪费项",
    "dashboard.estimates": "估算",
    "dashboard.finding": "发现",
    "dashboard.localAuditFinding": "本地安全审核发现",
    "dashboard.where": "位置",
    "dashboard.notSpecified": "未指定",
    "dashboard.fixLabel": "修复",
    "dashboard.reviewConfig": "检查此本地配置。",
    "dashboard.allClear": "全部正常 — 没有安全审核发现。",
    "dashboard.noUrgentFindings": "没有严重项或警告。",
    "dashboard.localAccessReview": "本地访问审查",
    "dashboard.total": "共 {count} 项",
    "dashboard.trafficAria": "{critical} 个严重项、{warning} 个警告、{info} 个信息项",
    "dashboard.critical": "严重",
    "dashboard.warning": "警告",
    "dashboard.info": "信息",
    "dashboard.thinkingPatterns": "思考模式",
    "dashboard.comingSoon": "即将推出",
    "dashboard.cognitionPlaceholder": "认知镜尚未实现。此区域为其本地摘要预留。",
    "dashboard.localSummary": "本地摘要",
    "dashboard.title": "SoloUnit — 本地健康面板",
    "dashboard.brand": "SoloUnit — 本地健康面板",
    "dashboard.generated": "生成于 {time}",
    "dashboard.trust": "本页所有内容均在本地计算。没有任何数据离开本机。",
    "dashboard.footer": "SoloUnit 本地健康面板 · 仅为本机生成",
    "dashboard.written": "面板已写入 {path}",
    "dashboard.opened": "已打开 {path}",
  }),
});

let activeLocale = ENGLISH;

function environmentLocale(env = {}) {
  const explicit = env.SOLOUNIT_LANG || env.ONECO_LANG;
  if (explicit) return String(explicit).toLowerCase().startsWith("zh") ? CHINESE : ENGLISH;
  const system = env.LC_ALL || env.LC_MESSAGES || env.LANG || "";
  return String(system).toLowerCase().startsWith("zh") ? CHINESE : ENGLISH;
}

export function resolveLocale(argv = [], env = {}) {
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    let value;
    if (argument === "--lang") value = argv[index + 1];
    else if (argument.startsWith("--lang=")) value = argument.slice("--lang=".length);
    else continue;

    if (!SUPPORTED_LOCALES.has(value)) {
      throw new Error(strings[environmentLocale(env)]["cli.langInvalid"]);
    }
    return value;
  }
  return environmentLocale(env);
}

export function setLocale(locale) {
  activeLocale = SUPPORTED_LOCALES.has(locale) ? locale : ENGLISH;
  return activeLocale;
}

export function t(key, params = {}) {
  const locale = SUPPORTED_LOCALES.has(params.locale) ? params.locale : activeLocale;
  const template = strings[locale][key] ?? strings.en[key];
  if (template === undefined) return key;
  return template.replace(/\{([A-Za-z0-9_]+)\}/g, (match, name) =>
    Object.hasOwn(params, name) ? String(params[name]) : match,
  );
}

export function stripLocaleArgs(argv = []) {
  const stripped = [];
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--lang") {
      index += 1;
      continue;
    }
    if (argument.startsWith("--lang=")) continue;
    stripped.push(argument);
  }
  return stripped;
}
