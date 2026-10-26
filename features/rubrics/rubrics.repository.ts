import { supabase } from "@/lib/db"
import type {
  RubricCategoryData,
  RubricCategoryWithItems,
  RubricItemData,
  IRubricRepository,
} from "@/lib/types"

export const rubricRepository: IRubricRepository = {
  async getCategoriesWithItems(groupId) {
    const { data, error } = await supabase
      .from("rubric_categories")
      .select("*")
      .eq("rubric_group_id", groupId)
      .order("displayOrder", { ascending: true })
    if (error) throw error

    const categoryIds = (data ?? []).map((c: { id: string }) => c.id)
    let items: RubricItemData[] = []
    if (categoryIds.length > 0) {
      const { data: itemsData, error: itemsErr } = await supabase
        .from("rubric_items")
        .select("*")
        .in("categoryId", categoryIds)
        .order("displayOrder", { ascending: true })
      if (itemsErr) throw itemsErr
      items = (itemsData ?? []) as RubricItemData[]
    }

    const itemsByCat = new Map<string, RubricItemData[]>()
    for (const item of items) {
      const list = itemsByCat.get(item.categoryId) ?? []
      list.push(item)
      itemsByCat.set(item.categoryId, list)
    }

    return (data ?? []).map((c: { id: string; [k: string]: unknown }) => ({
      ...c,
      items: itemsByCat.get(c.id) ?? [],
    })) as unknown as RubricCategoryWithItems[]
  },

  async replaceRubric(groupId, categories) {
    const { data: existingCats, error: fetchErr } = await supabase
      .from("rubric_categories")
      .select("id, name")
      .eq("rubric_group_id", groupId)
    if (fetchErr) throw fetchErr

    const oldCatIds = existingCats.map((c) => c.id)
    if (oldCatIds.length > 0) {
      const { error: delItemsErr } = await supabase.from("rubric_items").delete().in("categoryId", oldCatIds)
      if (delItemsErr) throw delItemsErr
      const { error: delCatsErr } = await supabase.from("rubric_categories").delete().in("id", oldCatIds)
      if (delCatsErr) throw delCatsErr
    }

    const createdCats: RubricCategoryData[] = []
    for (const cat of categories) {
      const { data: newCat, error: catErr } = await supabase
        .from("rubric_categories")
        .insert({ rubric_group_id: groupId, name: cat.name, displayOrder: cat.displayOrder })
        .select("*")
        .single()
      if (catErr) throw catErr

      const itemsToInsert = cat.items.map((item) => ({
        categoryId: newCat.id,
        text: item.text,
        displayOrder: item.displayOrder,
        weight: item.weight ?? 1,
      }))
      const { error: itemsErr } = await supabase.from("rubric_items").insert(itemsToInsert)
      if (itemsErr) throw itemsErr

      createdCats.push(newCat as RubricCategoryData)
    }

    return createdCats
  },

  async copyFromSource(groupId, sourceGroupId) {
    const { data: srcCats, error: fetchCatsErr } = await supabase
      .from("rubric_categories")
      .select("*")
      .eq("rubric_group_id", sourceGroupId)
      .order("displayOrder", { ascending: true })
    if (fetchCatsErr) throw fetchCatsErr

    const { data: srcItems, error: fetchItemsErr } = await supabase
      .from("rubric_items")
      .select("*")
      .in(
        "categoryId",
        srcCats.map((c) => c.id)
      )
      .order("displayOrder", { ascending: true })
    if (fetchItemsErr) throw fetchItemsErr

    const catIdMap = new Map<string, string>()
    const createdCats: RubricCategoryData[] = []
    for (const cat of srcCats) {
      const { data: newCat, error: catErr } = await supabase
        .from("rubric_categories")
        .insert({ rubric_group_id: groupId, name: cat.name, displayOrder: cat.displayOrder })
        .select("*")
        .single()
      if (catErr) throw catErr
      catIdMap.set(cat.id, newCat.id)
      createdCats.push(newCat as RubricCategoryData)
    }

    const itemsToInsert = srcItems
      .filter((item) => catIdMap.has(item.categoryId))
      .map((item) => ({
        categoryId: catIdMap.get(item.categoryId)!,
        text: item.text,
        displayOrder: item.displayOrder,
        weight: item.weight,
      }))

    if (itemsToInsert.length > 0) {
      const { error: itemsErr } = await supabase.from("rubric_items").insert(itemsToInsert)
      if (itemsErr) throw itemsErr
    }

    return createdCats
  },

  async deleteCategory(id) {
    const { error } = await supabase.from("rubric_categories").delete().eq("id", id)
    if (error) throw error
  },

  async deleteItem(id) {
    const { error } = await supabase.from("rubric_items").delete().eq("id", id)
    if (error) throw error
  },
  async createItem(data) {
    const { data: created, error } = await supabase.from("rubric_items").insert(data).select("*").single()
    if (error) throw error
    return created as RubricItemData
  },
  async updateItem(id, fields) {
    const { data, error } = await supabase.from("rubric_items").update(fields).eq("id", id).select("*").single()
    if (error) throw error
    return data as RubricItemData
  },
}
