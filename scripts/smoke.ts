import fs from 'node:fs'
import path from 'node:path'
import { initDb, getDb, closeDb } from '../src/main/db'
import * as tree from '../src/main/services/tree'
import * as cards from '../src/main/services/cards'
import * as tags from '../src/main/services/tags'
import * as search from '../src/main/services/search'
import * as history from '../src/main/services/history'
import * as io from '../src/main/services/io'
import type { CardInput } from '../src/shared/types'

const TMP = path.resolve('.tmp')
fs.mkdirSync(TMP, { recursive: true })
const DB = path.join(TMP, 'smoke.db')
for (const suffix of ['', '-wal', '-shm']) fs.rmSync(DB + suffix, { force: true })

let passed = 0
const failures: string[] = []

function check(name: string, condition: boolean, extra = ''): void {
  if (condition) {
    passed += 1
    console.log(`  ✓ ${name}`)
  } else {
    failures.push(name)
    console.log(`  ✗ ${name} ${extra}`)
  }
}

function eq(name: string, actual: unknown, expected: unknown): void {
  check(name, JSON.stringify(actual) === JSON.stringify(expected), `实际=${JSON.stringify(actual)} 期望=${JSON.stringify(expected)}`)
}

function expectThrow(name: string, fn: () => void): void {
  try {
    fn()
    check(name, false, '没有抛出异常')
  } catch {
    check(name, true)
  }
}

async function main(): Promise<void> {
  initDb(DB)
  const db = getDb()

  console.log('\n[1] 目录树：建文件夹 / 建卡片 / 多引用')
  const english = tree.createFolder(null, '英语')
  const vocab = tree.createFolder(english.id, '词汇', '大纲 1200 词，按频次排序')
  const grammar = tree.createFolder(english.id, '语法')
  const politics = tree.createFolder(null, '政治')
  const abandon = cards.createCard({ front: 'abandon', back: 'v. 放弃；抛弃', tagIds: [] })
  const phrase = cards.createCard({ front: 'abandon oneself to', back: '沉溺于……', tagIds: [] })
  const contradiction = cards.createCard({ front: '矛盾的普遍性', back: '矛盾存在于一切事物之中', tagIds: [] })

  const n1 = tree.createRefs(vocab.id, [abandon.id, phrase.id])
  eq('词汇下挂载 2 条引用', n1, 2)
  tree.createRefs(grammar.id, [abandon.id])
  const quick = tree.createFolder(null, '随身清单')
  tree.createRefs(quick.id, [abandon.id])
  const abandonRefs = tree.refLocations(abandon.id)
  eq('同一张卡片有 3 处引用', abandonRefs.length, 3)

  const nodes = tree.listNodes()
  eq('节点总数', nodes.length, 9)

  console.log('\n[2] 卡片引用节点不能有子节点')
  const abandonNode = nodes.find((n) => n.type === 'card' && n.cardId === abandon.id)!
  expectThrow('在卡片节点下建文件夹被拒绝', () => tree.createFolder(abandonNode.id, '非法子级'))
  expectThrow('在卡片节点下挂卡片被拒绝', () => tree.createRefs(abandonNode.id, [phrase.id]))

  console.log('\n[3] 文件夹备注')
  const vocabNode = tree.listNodes().find((n) => n.id === vocab.id)!
  eq('备注已保存', vocabNode.note, '大纲 1200 词，按频次排序')
  tree.setNote(vocab.id, '大纲 1200 词；每天 20 个')
  eq('备注更新成功', tree.listNodes().find((n) => n.id === vocab.id)!.note, '大纲 1200 词；每天 20 个')
  expectThrow('卡片节点不能写备注', () => tree.setNote(abandonNode.id, 'x'))

  console.log('\n[4] 子树统计')
  const stats = tree.subtreeStats(english.id)
  eq('英语子树文件夹数（含自身）', stats.folders, 3)
  eq('英语子树引用数', stats.refs, 3)
  eq('英语子树去重卡片数', stats.cards, 2)
  eq('在别处仍被引用的卡片数', stats.cardsOutside, 1)

  console.log('\n[5] 拖拽移动 / 防成环 / 排序')
  const phraseNodeId = tree.listNodes().find((n) => n.cardId === phrase.id)!.id
  tree.moveNode(phraseNodeId, politics.id, 0)
  const moved = tree.listNodes().find((n) => n.cardId === phrase.id)!
  eq('引用移动到政治下', moved.parentId, politics.id)
  expectThrow('不能把文件夹移动到自己的子级', () => tree.moveNode(english.id, vocab.id, 0))
  const vocabKids = tree.listNodes().filter((n) => n.parentId === vocab.id)
  eq('词汇下只剩 1 条引用', vocabKids.length, 1)

  console.log('\n[6] 标签体系独立')
  const tag1 = tags.createTag('四级')
  const tag2 = tags.createTag('高频')
  expectThrow('重名标签被拒绝', () => tags.createTag('四级'))
  cards.setCardTags(abandon.id, [tag1.id, tag2.id])
  eq('卡片绑定 2 个标签', cards.getCard(abandon.id).tags.length, 2)
  const filtered = cards.listCards({ tagIds: [tag1.id, tag2.id] })
  eq('双标签交集筛选', filtered.length, 1)
  const filteredOr = cards.listCards({ tagIds: [tag1.id, tag2.id], tagMode: 'or' })
  eq('并集筛选', filteredOr.length, 1)
  tags.renameTag(tag2.id, '高频词')
  eq('标签重命名', tags.listTags().find((t) => t.id === tag2.id)!.name, '高频词')
  eq('标签关联数量', tags.listTags().find((t) => t.id === tag1.id)!.count, 1)

  console.log('\n[7] 全局检索')
  const r1 = search.search('abandon')
  check('搜索命中卡片', r1.cards.length >= 2, `实际 ${r1.cards.length}`)
  check('搜索命中文件夹备注', search.search('每天 20').folders.length === 1)
  const r2 = search.search('矛盾')
  eq('搜索命中正面', r2.cards.length, 1)
  eq('卡片命中带引用路径', r2.cards[0].paths.length, 0)
  const r3 = search.search('abandon 放弃')
  eq('多关键词 AND', r3.cards.length, 1)
  eq('空关键词返回空', search.search('   ').total, 0)

  console.log('\n[8] 删除策略 ①：只删本层，子节点上移')
  const before = tree.listNodes().length
  const liftStats = tree.deleteFolder(grammar.id, 'lift')
  eq('策略①统计', liftStats.refs, 1)
  const englishKids = tree.listNodes().filter((n) => n.parentId === english.id)
  check('语法的子节点上移到英语下', englishKids.some((n) => n.cardId === abandon.id), JSON.stringify(englishKids.map((k) => k.name)))
  eq('节点数减少 1', tree.listNodes().length, before - 1)

  console.log('\n[9] 删除策略 ②：删结构保卡片')
  const detachStats = tree.deleteFolder(vocab.id, 'detach')
  eq('策略②保留卡片数', detachStats.cards, 1)
  eq('卡片本体仍在', cards.listCards({}).length, 3)
  eq('词汇下的引用已删除', tree.listNodes().filter((n) => n.parentId === vocab.id).length, 0)
  const orphan = cards.listCards({ unmountedOnly: true })
  check('出现未挂载卡片', orphan.length >= 1, `实际 ${orphan.length}`)

  console.log('\n[10] 删除策略 ③：连卡片一起删')
  const cascadeStats = tree.deleteFolder(politics.id, 'cascade')
  eq('策略③删除卡片数', cascadeStats.cards, 1)
  eq('卡片总数减少', cards.listCards({}).length, 2)

  console.log('\n[11] 删除卡片本体 → 引用级联消失')
  const abandonRefCountBefore = tree.refLocations(abandon.id).length
  check('删除前有引用', abandonRefCountBefore > 0, String(abandonRefCountBefore))
  cards.deleteCard(abandon.id)
  eq('引用节点全部消失', tree.listNodes().filter((n) => n.cardId === abandon.id).length, 0)
  eq('标签关联被清理', db.get<{ c: number }>('SELECT COUNT(*) AS c FROM card_tags WHERE card_id = ?', [abandon.id])!.c, 0)

  console.log('\n[12] 导入模板 → 解析 → 提交 → 导出')
  const template = path.join(TMP, 'template.xlsx')
  const bytes = await io.writeTemplate(template)
  check('模板已生成', bytes > 5000, `${bytes} bytes`)

  const parsed = await io.parseWorkbook(template)
  eq('模板解析：文件夹数', parsed.folders.length, 7)
  eq('模板解析：自动补建上级', parsed.autoFolders, 2)
  eq('模板解析：卡片数', parsed.cards.length, 3)
  eq('模板解析：引用数（含多引用）', parsed.refs.length, 4)
  eq('模板解析：标签数', parsed.tags.length, 3)
  eq('模板解析：无错误', parsed.issues.filter((i) => i.level === 'error').length, 0)

  const preview = await io.prepareImport(template)
  check('预览可导入', preview.canImport, JSON.stringify(preview.issues.slice(0, 3)))
  const importResult = io.commitImport(preview.token, { mode: 'replace', reuseExistingCards: true })
  eq('导入新建文件夹', importResult.folders, 7)
  eq('导入新建卡片', importResult.cards, 3)
  eq('导入引用数', importResult.refs, 4)
  eq('导入标签数', importResult.tags, 3)
  const abandonAfterImport = cards.listCards({ keyword: 'abandon' })
  check('导入后 abandon 存在', abandonAfterImport.length >= 1)
  const importedRefs = tree.refLocations(abandonAfterImport[0].id)
  eq('模板中的多引用被还原', importedRefs.length, 2)
  const noteRestored = tree.listNodes().some((n) => n.name === '词汇' && n.note.includes('大纲 1200 词'))
  check('文件夹备注随导入保留', noteRestored)

  console.log('\n[13] 导出 JSON / Excel 往返')
  const jsonPath = path.join(TMP, 'backup.json')
  const jsonBytes = io.exportJsonTo(jsonPath)
  const payload = JSON.parse(fs.readFileSync(jsonPath, 'utf8'))
  eq('JSON 含全部卡片', payload.cards.length, 3)
  eq('JSON 含全部节点', payload.nodes.length, tree.listNodes().length)
  check('JSON 体积合理', jsonBytes > 1000)

  const nodeCountBeforeRestore = tree.listNodes().length
  const restorePreview = await io.prepareImport(jsonPath)
  check('JSON 备份可被识别', restorePreview.canImport && restorePreview.cards === 3)
  const restored = io.commitImport(restorePreview.token, { mode: 'replace', reuseExistingCards: false })
  eq('JSON 还原卡片数', restored.cards, 3)
  eq('JSON 还原节点数', restored.folders + restored.refs, nodeCountBeforeRestore)
  eq('JSON 还原标签数', restored.tags, 3)
  eq('JSON 还原后多引用仍在', tree.refLocations(cards.listCards({ keyword: 'abandon' })[0].id).length, 2)
  eq('JSON 还原后备注仍在', tree.listNodes().filter((n) => n.note.includes('大纲 1200 词')).length, 1)

  const xlsxPath = path.join(TMP, 'export.xlsx')
  const xlsxBytes = await io.exportExcelTo(xlsxPath)
  check('Excel 导出成功', xlsxBytes > 5000)
  const rePreview = await io.prepareImport(xlsxPath)
  check('导出的 Excel 可以再次导入', rePreview.canImport, JSON.stringify(rePreview.issues.slice(0, 3)))
  const reResult = io.commitImport(rePreview.token, { mode: 'replace', reuseExistingCards: false })
  eq('往返后卡片数一致', reResult.cards, 3)
  eq('往返后引用数一致', reResult.refs, 4)
  const roundTripRefs = tree.refLocations(cards.listCards({ keyword: 'abandon' })[0].id)
  eq('往返后多引用保留', roundTripRefs.length, 2)

  console.log('\n[15] 保存前留底：历史版本')
  const histCard = cards.createCard({ front: '原始题干', back: '原始答案', tagIds: [] })
  eq('内容没变不产生历史', history.listHistory('card', histCard.id).length, 0)
  cards.updateCard(histCard.id, { front: '改成更短的一句', back: '原始答案', tagIds: [] })
  const cardHistory = history.listHistory('card', histCard.id)
  eq('修改后留下 1 条历史', cardHistory.length, 1)
  eq('历史里存的是旧内容', cardHistory[0].content, '原始题干')
  eq('历史记录的字段', cardHistory[0].field, 'front')
  cards.updateCard(histCard.id, { front: '再短一点', back: '原始答案', tagIds: [] })
  eq('再改一次得到 2 条历史', history.listHistory('card', histCard.id).length, 2)

  const histFolder = tree.createFolder(null, '历史文件夹', '备注第一版')
  tree.setNote(histFolder.id, '备注第二版')
  const noteHistory = history.listHistory('folder', histFolder.id)
  eq('备注修改留下历史', noteHistory.length, 1)
  eq('备注历史内容', noteHistory[0].content, '备注第一版')
  eq('备注历史字段', noteHistory[0].field, 'note')

  cards.deleteCard(histCard.id)
  eq('删除卡片时清掉历史', history.listHistory('card', histCard.id).length, 0)
  tree.deleteFolder(histFolder.id, 'detach')
  eq('删除文件夹时清掉历史', history.listHistory('folder', histFolder.id).length, 0)

  console.log('\n[14] 备份 / 数据持久化')
  const backup = path.join(TMP, 'snapshot.db')
  db.backupTo(backup)
  check('备份文件生成', fs.existsSync(backup) && fs.statSync(backup).size > 1000)
  closeDb()
  initDb(DB)
  eq('重开数据库后数据仍在', tree.listNodes().length > 0 && cards.listCards({}).length === 3, true)
  closeDb()

  console.log(`\n===== 通过 ${passed} 项，失败 ${failures.length} 项 =====`)
  if (failures.length) {
    console.log('失败项：\n - ' + failures.join('\n - '))
    process.exitCode = 1
  }
}

main().catch((error) => {
  console.error('测试中断：', error)
  process.exitCode = 1
})
