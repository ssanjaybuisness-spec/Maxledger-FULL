
import { useState, type FormEvent } from "react";
import { Plus, Pencil, Trash2, X, Check, Tags, TrendingUp, TrendingDown, FolderOpen } from "lucide-react";
import type { Category, Transaction } from "../types";

interface Props {
  categories: Category[];
  transactions: Transaction[];
  onChange: (categories: Category[], transactions: Transaction[]) => void;
}

export default function CategoryManager({ categories, transactions, onChange }: Props) {
  const [name, setName] = useState("");
  const [type, setType] = useState<"income" | "expense">("income");
  const [editingId, setEditingId] = useState<string | null>(null);
  const colors = ["#91A86B", "#6D9CC8", "#A18BC4", "#C69A62", "#C77F78", "#6EAAA0", "#B4A56B", "#8995A5"];

  const incomeCount = categories.filter(c => c.type === "income").length;
  const expenseCount = categories.filter(c => c.type === "expense").length;

  function resetForm() {
    setName("");
    setEditingId(null);
    setType("income");
  }

  function saveCategory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleanName = name.trim();
    if (!cleanName) return;

    const duplicate = categories.some(c =>
      c.type === type &&
      c.name.toLowerCase() === cleanName.toLowerCase() &&
      c.id !== editingId
    );

    if (duplicate) {
      window.alert("This category already exists.");
      return;
    }

    if (editingId) {
      const oldCategory = categories.find(c => c.id === editingId);
      if (!oldCategory) return;

      const updatedCategories = categories.map(c =>
        c.id === editingId ? { ...c, name: cleanName, type } : c
      );

      const updatedTransactions = transactions.map(t =>
        t.category === oldCategory.name
          ? { ...t, category: cleanName, type, updatedAt: Date.now() }
          : t
      );

      onChange(updatedCategories, updatedTransactions);
    } else {
      const newCategory: Category = {
        id: crypto.randomUUID(),
        name: cleanName,
        type,
        color: colors[categories.length % colors.length],
        icon: "circle"
      };

      onChange([...categories, newCategory], transactions);
    }

    resetForm();
  }

  function editCategory(category: Category) {
    setEditingId(category.id);
    setName(category.name);
    setType(category.type);
    document.querySelector(".category-editor")?.scrollIntoView({
      behavior: "smooth",
      block: "center"
    });
  }

  function deleteCategory(category: Category) {
    const isUsed = transactions.some(t => t.category === category.name);

    if (isUsed) {
      window.alert("This category is used by existing transactions. Change those transactions to another category first.");
      return;
    }

    if (!window.confirm(`Delete "${category.name}"?`)) return;

    onChange(categories.filter(c => c.id !== category.id), transactions);

    if (editingId === category.id) resetForm();
  }

  function renderGroup(categoryType: "income" | "expense") {
    const items = categories.filter(c => c.type === categoryType);
    const isIncome = categoryType === "income";

    return (
      <section className={`category-section ${isIncome ? "income-section" : "expense-section"}`} key={categoryType}>
        <div className="category-section-heading">
          <div className="category-section-icon">
            {isIncome ? <TrendingUp size={18} /> : <TrendingDown size={18} />}
          </div>
          <div>
            <h3>{isIncome ? "Income" : "Expenses"}</h3>
            <p>{items.length} categories</p>
          </div>
          <span className="category-section-count">{items.length}</span>
        </div>

        {items.length ? (
          <div className="category-grid">
            {items.map(category => (
              <article className="category-card" key={category.id}>
                <span
                  className="category-card-dot"
                  style={{ background: category.color || "#91A86B" }}
                />
                <div className="category-card-info">
                  <strong>{category.name}</strong>
                  <span>
                    {transactions.filter(t => t.category === category.name).length} transactions
                  </span>
                </div>
                <div className="category-card-actions">
                  <button type="button" className="category-icon-action" onClick={() => editCategory(category)} aria-label={`Edit ${category.name}`}>
                    <Pencil size={15} />
                  </button>
                  <button type="button" className="category-icon-action danger" onClick={() => deleteCategory(category)} aria-label={`Delete ${category.name}`}>
                    <Trash2 size={15} />
                  </button>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="category-empty">
            <FolderOpen size={19} />
            <span>No {categoryType} categories yet.</span>
          </div>
        )}
      </section>
    );
  }

  return (
    <section className="category-manager category-redesign">
      <div className="category-overview">
        <div className="category-overview-icon"><Tags size={21} /></div>
        <div className="category-overview-copy">
          <span>YOUR ORGANISATION</span>
          <h2>Categories</h2>
          <p>Keep income and expenses organised.</p>
        </div>
        <div className="category-total">
          <strong>{categories.length}</strong>
          <span>Total</span>
        </div>
      </div>

      <div className="category-quick-stats">
        <div><TrendingUp size={15} /><strong>{incomeCount}</strong><span>Income</span></div>
        <div><TrendingDown size={15} /><strong>{expenseCount}</strong><span>Expense</span></div>
      </div>

      <form className="category-editor" onSubmit={saveCategory}>
        <div className="category-editor-heading">
          <div>
            <span className="category-kicker">{editingId ? "UPDATE CATEGORY" : "BUILD YOUR LIST"}</span>
            <h3>{editingId ? "Edit category" : "Add a category"}</h3>
          </div>
          {editingId && (
            <button type="button" className="category-icon-action" onClick={resetForm}>
              <X size={17} />
            </button>
          )}
        </div>

        <label htmlFor="category-name">Category name</label>
        <input
          id="category-name"
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="e.g. Freelance, Food, Travel"
          maxLength={40}
          required
        />

        <label htmlFor="category-type">Category type</label>
        <select
          id="category-type"
          value={type}
          onChange={e => setType(e.target.value as "income" | "expense")}
        >
          <option value="income">Income</option>
          <option value="expense">Expense</option>
        </select>

        <button className="category-submit" type="submit">
          {editingId ? <Check size={17} /> : <Plus size={17} />}
          {editingId ? "Save changes" : "Add category"}
        </button>
      </form>

      <div className="category-groups">
        {renderGroup("income")}
        {renderGroup("expense")}
      </div>
    </section>
  );
}
