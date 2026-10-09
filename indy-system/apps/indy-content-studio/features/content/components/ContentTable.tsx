export interface ContentTableRow {
  id: string;
  title: string;
  category: string;
  format: string;
  readyDate: string;
  captionState: string;
  status: string;
}

export function ContentTable({ items }: { items: ContentTableRow[] }) {
  return (
    <section aria-labelledby="content-table-heading">
      <h2 id="content-table-heading">ชิ้นงานในเดือนนี้ ({items.length})</h2>
      <table>
        <thead>
          <tr>
            <th>ชิ้นงาน</th>
            <th>หมวด / รูปแบบ</th>
            <th>พร้อมผลิต</th>
            <th>แคปชั่น</th>
            <th>สถานะ</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id}>
              <td>{item.title}</td>
              <td>{item.category} / {item.format}</td>
              <td>{item.readyDate}</td>
              <td>{item.captionState}</td>
              <td>{item.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
