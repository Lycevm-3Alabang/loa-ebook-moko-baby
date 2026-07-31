import { supabase } from "@/lib/db"
import type { DepartmentCourseData, IDepartmentCourseRepository } from "@/lib/types"
import { singleQuery } from "@/lib/db/common"

export const departmentCourseRepository: IDepartmentCourseRepository = {
  async findByDepartmentAndCode(departmentId, code) {
    return singleQuery<DepartmentCourseData>(
      supabase.from("department_courses").select("*").eq("departmentId", departmentId).eq("code", code) as unknown as { single(): Promise<{ data: unknown; error: { code?: string; message?: string } | null }> },
    )
  },
  async create(data) {
    const { data: created, error } = await supabase.from("department_courses").insert(data).select("*").single()
    if (error) throw error
    return created as DepartmentCourseData
  },
  async update(id, data) {
    const { data: updated, error } = await supabase.from("department_courses").update(data).eq("id", id).select("*").single()
    if (error) throw error
    return updated as DepartmentCourseData
  },
  async findAll() {
    const { data, error } = await supabase.from("department_courses").select("*")
    if (error) throw error
    return (data || []) as DepartmentCourseData[]
  },
  async findById(id) {
    const { data, error } = await supabase.from("department_courses").select("*").eq("id", id).single()
    if (error) {
      if (error.code === "PGRST116") return null
      throw error
    }
    return data as DepartmentCourseData
  },
  async deleteById(id) {
    const { error } = await supabase.from("department_courses").delete().eq("id", id)
    if (error) throw error
  },
}
