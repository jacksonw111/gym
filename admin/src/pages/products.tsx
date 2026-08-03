import { type FormEvent, useState } from 'react'
import type { AdminApi, AdminData, ProductInput } from '../api'
import { ButtonLoading } from '../components/loading'

const blankProduct: ProductInput = {
  name: '',
  price: 0,
  lessons: 1,
  coachId: '',
  validDays: undefined,
}
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
  const [error, setError] = useState('')
  const [busy, setBusy] = useState('')

  const save = async (event: FormEvent) => {
    event.preventDefault()
    if (!editing?.name || !editing.coachId || editing.price <= 0 || editing.lessons <= 0) return
    setBusy('save')
    setError('')
    try {
      await api.saveProduct(editing)
      await refresh()
      setEditing(null)
      setMessage('课包商品已保存；历史订单快照不会变更')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '课包保存失败')
    } finally {
      setBusy('')
    }
  }

  const validityText = (validDays: number | undefined): string =>
    validDays ? `${validDays} 天` : '长期有效'

  const toggle = async (id: string, published: boolean) => {
    setBusy(`status-${id}`)
    setError('')
    try {
      await api.setProductStatus(id, published ? 'unpublished' : 'published')
      await refresh()
      setMessage(published ? '课包已下架，历史销售记录已保留' : '课包已上架')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '状态更新失败，请重试')
    } finally {
      setBusy('')
    }
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
      {error && (
        <p className="feedback error" role="alert">
          {error}
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
          <label>
            有效期（天）
            <input
              type="number"
              min="1"
              step="1"
              placeholder="留空为长期有效"
              value={editing.validDays ?? ''}
              onChange={(event) =>
                setEditing({
                  ...editing,
                  validDays: event.target.value === '' ? undefined : Number(event.target.value),
                })
              }
            />
          </label>
          <label>
            绑定教练
            <select
              value={editing.coachId}
              onChange={(event) => setEditing({ ...editing, coachId: event.target.value })}
              required
            >
              <option value="">请选择教练</option>
              {data.coaches
                .filter((coach) => coach.status === 'active' || coach.id === editing.coachId)
                .map((coach) => (
                  <option key={coach.id} value={coach.id}>
                    {coach.name} · {coach.specialty}
                  </option>
                ))}
            </select>
          </label>
          <div className="button-row">
            <button
              type="button"
              className="secondary-button"
              onClick={() => setEditing(null)}
              disabled={Boolean(busy)}
            >
              取消
            </button>
            <button
              type="submit"
              className="primary-button"
              disabled={Boolean(busy)}
              aria-busy={busy === 'save'}
            >
              {busy === 'save' ? <ButtonLoading label="保存中…" /> : '保存'}
            </button>
          </div>
        </form>
      )}
      <section className="table-wrap product-table">
        <table>
          <thead>
            <tr>
              <th>课包名称</th>
              <th>绑定教练</th>
              <th>价格</th>
              <th>课时数</th>
              <th>有效期</th>
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
                <td>{product.coachName}</td>
                <td className="numeric">{money(product.price)}</td>
                <td>{product.lessons} 节</td>
                <td>{validityText(product.validDays)}</td>
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
                      disabled={Boolean(busy)}
                      onClick={() =>
                        setEditing({
                          id: product.id,
                          name: product.name,
                          price: product.price,
                          lessons: product.lessons,
                          coachId: product.coachId,
                          validDays: product.validDays,
                        })
                      }
                    >
                      编辑
                    </button>
                    <button
                      type="button"
                      className="text-button"
                      onClick={() => void toggle(product.id, product.status === 'published')}
                      disabled={Boolean(busy)}
                      aria-busy={busy === `status-${product.id}`}
                    >
                      {busy === `status-${product.id}` ? (
                        <ButtonLoading
                          label={product.status === 'published' ? '下架中…' : '上架中…'}
                        />
                      ) : product.status === 'published' ? (
                        '下架'
                      ) : (
                        '上架'
                      )}
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
