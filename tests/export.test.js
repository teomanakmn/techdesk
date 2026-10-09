import { test, expect } from 'vitest'
import * as XLSX from 'xlsx'
test('patched export library preserves workbook sheets, Turkish text and literal user content', () => {
  const rows=[{'Başlık':'Sentetik ağ sorunu','Açıklama':'=1+1','Ad':'Sentetik Kullanıcı','Puan':4}]
  const workbook=XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook,XLSX.utils.json_to_sheet(rows),'Talepler')
  XLSX.utils.book_append_sheet(workbook,XLSX.utils.json_to_sheet([{Toplam:1}]),'Özet')
  const bytes=XLSX.write(workbook,{type:'array',bookType:'xlsx'})
  const reopened=XLSX.read(bytes,{type:'array'})
  expect(reopened.SheetNames).toEqual(['Talepler','Özet'])
  expect(XLSX.utils.sheet_to_json(reopened.Sheets.Talepler)).toEqual(rows)
  expect(reopened.Sheets.Talepler.B2.t).toBe('s')
  expect(reopened.Sheets.Talepler.B2.f).toBeUndefined()
})
