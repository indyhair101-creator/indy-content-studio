export interface ProductionCard {
  id: string;
  title: string;
  status: string;
}

export function ProductionBoard({ items }: { items: ProductionCard[] }) {
  const groups = items.reduce<Record<string, ProductionCard[]>>((all, item) => {
    (all[item.status] ??= []).push(item);
    return all;
  }, {});

  return (
    <section aria-labelledby="production-board-heading">
      <h2 id="production-board-heading">บอร์ดการผลิต</h2>
      <div>
        {Object.entries(groups).map(([status, cards]) => (
          <section key={status} aria-label={status}>
            <h3>{status}</h3>
            <ul>
              {cards.map((card) => <li key={card.id}>{card.title}</li>)}
            </ul>
          </section>
        ))}
      </div>
    </section>
  );
}
