
import { useState, type FormEvent } from "react";
import { Plus, Pencil, Trash2, X, Check } from "lucide-react";
import type { Category, Transaction } from "../types";

interface Props {
  categories: Category[];
  transactions: Transaction[];
  onChange: (categories: Category[], transactions: Transaction[]) => void;
}

export default function CategoryManager({
  categories,
  transactions,
  onChange
}: Props) {
  const [name, setName] = useState("");
  const [type, setType] = useState<"income" | "expense">("income");
  const [editingId, setEditingId] = useState<string | null>(null);

  const colors = [
    "#34d399", "#60a5fa", "#a78bfa", "#fbbf24",
    "#fb923c", "#f472b6", "#38bdf8", "#94a3b8"
  ];

  function saveCategory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const cleanName = name.trim();

    if (!cleanName) return;

    const duplicate = categories.some(category =>
      category.type === type &&
      category.name.toLowerCase() === cleanName.toLowerCase() &&
      category.id !== editingId
    );

    if (duplicate) {
      window.alert("This category already exists.");
      return;
    }

    if (editingId) {
      const oldCategory = categories.find(
        category => category.id === editingId
      );

      if (!oldCategory) return;

      const updatedCategories = categories.map(category =>
        category.id === editingId
          ? { ...category, name: cleanName, type }
          : category
      );

      const updatedTransactions = transactions.map(transaction =>
        transaction.category === oldCategory.name
          ? { ...transaction, category: cleanName, type, updatedAt: Date.now() }
          : transaction
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

    setName("");
    setEditingId(null);
  }

  function editCategory(category: Category) {
    setEditingId(category.id);
    setName(category.name);
    setType(category.type);
  }

  function deleteCategory(category: Category) {
    const isUsed = transactions.some(
      transaction => transaction.category === category.name
    );

    if (isUsed) {
      window.alert(
        "This category is used by existing transactions. Change those transactions to another category first."
      );
      return;
    }

    if (!window.confirm(`Delete "${category.name}"?`)) return;

    onChange(
      categories.filter(item => item.id !== category.id),
      transactions
    );

    if (editingId === category.id) {
      setEditingId(null);
      setName("");
    }
  }

  return (
    <section className="category-manager">
      <div className="section-heading">
        <div>
          <p>PERSONALISE</p>
          <h2>Manage categories</h2>
        </div>
      </div>

      <form className="transaction-form" onSubmit={saveCategory}>
        <div className="form-heading">
          <h3>{editingId ? "Edit category" : "New category"}</h3>

          {editingId && (
            <button
              type="button"
              className="icon-button"
              onClick={() => {
                setEditingId(null);
                setName("");
              }}
            >
              <X size={18} />
            </button>
          )}
        </div>

        <label>Category name</label>
        <input
          value={name}
          onChange={event => setName(event.target.value)}
          placeholder="e.g. Freelance Projects"
          maxLength={40}
          required
        />

        <label>Category type</label>
        <select
          value={type}
          onChange={event =>
            setType(event.target.value as "income" | "expense")
          }
        >
          <option value="income">Income</option>
          <option value="expense">Expense</option>
        </select>

        <button className="submit-button" type="submit">
          {editingId ? <Check size={17} /> : <Plus size={17} />}
          {editingId ? "Update category" : "Add category"}
        </button>
      </form>

      {(["income", "expense"] as const).map(categoryType => (
        <div className="category-group" key={categoryType}>
          <h3>{categoryType === "income" ? "Income categories" : "Expense categories"}</h3>

          {categories
            .filter(category => category.type === categoryType)
            .map(category => (
              <article className="category-row" key={category.id}>
                <span
                  className="category-dot"
                  style={{ background: category.color }}
                />

                <strong>{category.name}</strong>

                <button
                  className="row-action"
                  aria-label={`Edit ${category.name}`}
                  onClick={() => editCategory(category)}
                >
                  <Pencil size={16} />
                </button>

                <button
                  className="row-action delete-action"
                  aria-label={`Delete ${category.name}`}
                  onClick={() => deleteCategory(category)}
                >
                  <Trash2 size={16} />
                </button>
              </article>
            ))}
        </div>
      ))}
    </section>
  );
}
