import { type FormEvent, useState } from 'react'
import type { AdminApi, AdminData, ProductInput } from '../api'

const blankProduct: ProductInput = { name: '', price: 0, lessons: 1 }
const money = (value: number) =>
  new Intl.NumberFormat('zh-CN', {
    style: 'currency',
    currency: 'CNY',
    maximumFractionDigits: 0,
  }).format(value)

export function ProductsPage({
  api,
  data,
  refresh,
}: {
  api: AdminApi
  data: AdminData
  refresh: () => Promise<void>
}) {
  const [editing, setEditing] = useState<ProductInput | null>(null)
  const [message, setMessage] = useState('')

  const save = async (event: FormEvent) => {
    event.preventDefault()
    if (!editing?.name || editing.price <= 0 || editing.lessons <= 0) return
    await api.saveProduct(editing)
    await refresh()
    setEditing(null)
    setMessage('课包商品已保存；历史订单快照不会变更')
  }

  const toggle = async (id: string, published: boolean) => {
    await api.setProductStatus(id, published ? 'unpublished' : 'published')
    await refresh()
    setMessage(published ? '课包已下架，历史销售记录已保留' : '课包已上架')
  }

  return (
    <section>
      <header className="page-heading">
        <div>
          <p className="eyebrow">PACKAGE CATALOG</p>
          <h1>课包管理</h1>
          <p>商品可以编辑与上下架，不提供删除。已售订单始终保留购买时的名称、价格与课时快照。</p>
        </div>
        <button type="button" className="primary-button" onClick={() => setEditing(blankProduct)}>
          ＋ 新增课包
        </button>
      </header>
      {message && (
        <p className="feedback success" role="status">
          {message}
        </p>
      )}
      {editing && (
        <form className="editor-strip product-editor" onSubmit={save}>
          <div>
            <p className="eyebrow">{editing.id ? 'EDIT PACKAGE' : 'NEW PACKAGE'}</p>
            <h2>{editing.id ? '编辑课包' : '新增课包'}</h2>
          </div>
          <label>
            名称
            <input
              value={editing.name}
              onChange={(event) => setEditing({ ...editing, name: event.target.value })}
              required
            />
          </label>
          <label>
            价格（元）
            <input
              type="number"
              min="1"
              value={editing.price}
              onChange={(event) => setEditing({ ...editing, price: Number(event.target.value) })}
              required
            />
          </label>
          <label>
            课时数
            <input
              type="number"
              min="1"
              step="1"
              value={editing.lessons}
              onChange={(event) => setEditing({ ...editing, lessons: Number(event.target.value) })}
              required
            />
          </label>
          <div className="button-row">
            <button type="button" className="secondary-button" onClick={() => setEditing(null)}>
              取消
            </button>
            <button type="submit" className="primary-button">
              保存
            </button>
          </div>
        </form>
      )}
      <section className="table-wrap product-table">
        <table>
          <thead>
            <tr>
              <th>课包名称</th>
              <th>价格</th>
              <th>课时数</th>
              <th>历史销量</th>
              <th>状态</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {data.products.map((product) => (
              <tr key={product.id}>
                <td>
                  <strong>{product.name}</strong>
                  <small>SKU / {product.id.replace('product-', '').toUpperCase()}</small>
                </td>
                <td className="numeric">{money(product.price)}</td>
                <td>{product.lessons} 节</td>
                <td>{product.soldCount} 份</td>
                <td>
                  <span className={`status ${product.status}`}>
                    {product.status === 'published' ? '售卖中' : '已下架'}
                  </span>
                </td>
                <td>
                  <div className="button-row compact">
                    <button
                      type="button"
                      className="text-button"
                      onClick={() =>
                        setEditing({
                          id: product.id,
                          name: product.name,
                          price: product.price,
                          lessons: product.lessons,
                        })
                      }
                    >
                      编辑
                    </button>
                    <button
                      type="button"
                      className="text-button"
                      onClick={() => void toggle(product.id, product.status === 'published')}
                    >
                      {product.status === 'published' ? '下架' : '上架'}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <p className="footnote">
        注：编辑只影响之后的销售；会员订单中保存的商品快照不会随当前商品变化。
      </p>
    </section>
  )
}
