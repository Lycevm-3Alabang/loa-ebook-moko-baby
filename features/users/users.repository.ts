import { supabase } from "@/lib/db"
import type {
  UserData,
  IUserRepository,
} from "@/lib/types"
import { USER_SELECT, USER_SELECT_WITH_PASSWORD, USER_COLUMNS_NO_PASSWORD, singleQueryWithRoles, toUsersWithRoles, toUserWithRole, isMissingUserrole } from "@/lib/db/common"
import type { QueryError, DbRecord } from "@/lib/db/common"
import { logAuditEvent } from "@/lib/services/audit"

// Helper to log user operations
async function logUserAction(email: string, action: string, details?: string) {
  await logAuditEvent({ email, action, details })
}

export const userRepository: IUserRepository = {
  async findByEmail(email) {
    const trimmed = email.trim()
    try {
      return await singleQueryWithRoles(
        supabase.from("users").select(USER_SELECT_WITH_PASSWORD).eq("email", trimmed) as unknown as { single(): Promise<{ data: unknown; error: QueryError | null }> }
      )
    } catch (err) {
      if (isMissingUserrole(err as QueryError)) {
        const { data } = await supabase.from("users").select(USER_COLUMNS_NO_PASSWORD).ilike("email", trimmed + "%").single()
        return data ? { ...data, role: "GUEST" } as UserData : null
      }
      throw err
    }
  },

  async findManyByEmail(emails) {
    const unique = [...new Set(emails.map((e) => e.toLowerCase().trim()))]
    console.log(`[findManyByEmail] Querying ${unique.length} unique emails...`)

    const CHUNK_SIZE = 200
    const allRows: DbRecord[] = []

    try {
      for (let i = 0; i < unique.length; i += CHUNK_SIZE) {
        const chunk = unique.slice(i, i + CHUNK_SIZE)
        console.log(`[findManyByEmail] Querying chunk ${Math.floor(i / CHUNK_SIZE) + 1} (${chunk.length} emails)...`)
        const { data, error } = await supabase.from("users").select(USER_SELECT).in("email", chunk)
        if (error) {
          console.error(`[findManyByEmail] Supabase error on chunk ${Math.floor(i / CHUNK_SIZE) + 1}:`, JSON.stringify(error))
          throw error
        }
        allRows.push(...(data || []) as DbRecord[])
      }
      console.log(`[findManyByEmail] Supabase returned ${allRows.length} total rows across ${Math.ceil(unique.length / CHUNK_SIZE)} chunks`)
      const result = new Map<string, UserData>()
      for (const row of allRows) {
        result.set((row.email as string).toLowerCase(), toUserWithRole(row))
      }
      return result
    } catch (err) {
      if (isMissingUserrole(err as QueryError)) {
        const fallbackRows: DbRecord[] = []
        for (let i = 0; i < unique.length; i += CHUNK_SIZE) {
          const chunk = unique.slice(i, i + CHUNK_SIZE)
          const { data } = await supabase.from("users").select(USER_COLUMNS_NO_PASSWORD).in("email", chunk)
          fallbackRows.push(...(data || []) as DbRecord[])
        }
        const result = new Map<string, UserData>()
        for (const row of fallbackRows) {
          result.set((row.email as string).toLowerCase(), { ...row, role: "GUEST" } as unknown as UserData)
        }
        return result
      }
      throw err
    }
  },
  async findById(id) {
    try {
      return await singleQueryWithRoles(
        supabase.from("users").select(USER_SELECT).eq("id", id) as unknown as { single(): Promise<{ data: unknown; error: QueryError | null }> }
      )
    } catch (err) {
      if (isMissingUserrole(err as QueryError)) {
        const { data } = await supabase.from("users").select(USER_COLUMNS_NO_PASSWORD).eq("id", id).single()
        return data ? { ...data, role: "GUEST" } as UserData : null
      }
      throw err
    }
  },
  async create(input) {
    const { role, ...userFields } = input
    userFields.email = userFields.email?.toLowerCase().trim() ?? userFields.email
    const { data, error } = await supabase.from("users").insert(userFields).select("id, email").single()
    if (error) throw error

    if (role) {
      const roleNames = role.split("|")
      for (const roleName of roleNames) {
        const { error: roleErr } = await supabase.from("userrole").insert({ userId: data.id, roleName })
        if (roleErr) throw roleErr
      }
    }

    const { data: withRoles } = await supabase.from("users").select(USER_SELECT).eq("id", data.id).single()
    if (!withRoles) throw new Error("Failed to fetch created user")
    const user = toUserWithRole(withRoles as Record<string, unknown>)
    await logUserAction(user.email, "CREATE_USER", `Created ${role} user: ${user.name}`)
    return user
  },

  async createMany(inputs) {
    if (inputs.length === 0) return { created: new Map(), failures: [] }

    const CHUNK_SIZE = 200
    const allInserted: DbRecord[] = []
    const allFailures: string[] = []

    for (let i = 0; i < inputs.length; i += CHUNK_SIZE) {
      const chunk = inputs.slice(i, i + CHUNK_SIZE)
      const userFields = chunk.map(({ role: _role, ...fields }) => ({
        ...fields,
        email: fields.email.toLowerCase().trim(),
      }))
      console.log(`[createMany] Inserting chunk ${Math.floor(i / CHUNK_SIZE) + 1} (${userFields.length} users)...`)
      const { data: users, error: userErr } = await supabase.from("users").insert(userFields).select("id, email")
      if (userErr) {
        console.error(`[createMany] Chunk ${Math.floor(i / CHUNK_SIZE) + 1} insert failed:`, JSON.stringify(userErr, null, 2))
        allFailures.push(...chunk.map((i) => i.email.toLowerCase().trim()))
        continue
      }
      console.log(`[createMany] Chunk ${Math.floor(i / CHUNK_SIZE) + 1} succeeded: ${(users || []).length} rows`)
      allInserted.push(...(users as DbRecord[]))
    }

    const allInsertedIds = allInserted.map((u) => u.id)
    const roleInserts = allInserted.flatMap((row) => {
      const input = inputs.find((i) => i.email.toLowerCase().trim() === (row.email as string).toLowerCase())
      if (!input?.role) return []
      return input.role.split("|").map((roleName: string) => ({ userId: row.id, roleName }))
    })
    if (roleInserts.length > 0) {
      for (let i = 0; i < roleInserts.length; i += CHUNK_SIZE) {
        const chunk = roleInserts.slice(i, i + CHUNK_SIZE)
        const { error: roleErr } = await supabase.from("userrole").insert(chunk)
        if (roleErr) console.warn(`[createMany] Role insert chunk failed:`, roleErr.message)
      }
    }

    const withRolesRows: DbRecord[] = []
    for (let i = 0; i < allInsertedIds.length; i += CHUNK_SIZE) {
      const chunk = allInsertedIds.slice(i, i + CHUNK_SIZE)
      const { data: withRoles } = await supabase.from("users").select(USER_SELECT).in("id", chunk)
      withRolesRows.push(...(withRoles || []) as DbRecord[])
    }

    const result = new Map<string, UserData>()
    for (const row of withRolesRows) {
      result.set((row.email as string).toLowerCase(), toUserWithRole(row))
    }
    await logUserAction("system", "BULK_CREATE_USERS", `Created ${allInserted.length} users via ETL`)
    return { created: result, failures: allFailures }
  },

  async listByRole(role, options) {
    try {
      let query = supabase.from("users").select(USER_SELECT).eq("userrole.roleName", role)
      if (!options?.includeDeleted) {
        query = query.is("deletedAt", null)
      }
      const { data, error } = await query
      if (error) throw error
      return toUsersWithRoles(data)
    } catch (err) {
      if (isMissingUserrole(err as QueryError)) {
        console.warn("[repo] userrole table not found — listByRole returns empty")
        return []
      }
      throw err
    }
  },
  async listByDepartment(departmentId, options) {
    try {
      let query = supabase.from("users").select(USER_SELECT).eq("departmentId", departmentId)
      if (!options?.includeDeleted) {
        query = query.is("deletedAt", null)
      }
      const { data, error } = await query
      if (error) throw error
      return toUsersWithRoles(data)
    } catch (err) {
      if (isMissingUserrole(err as QueryError)) {
        const { data } = await supabase.from("users").select(USER_COLUMNS_NO_PASSWORD).eq("departmentId", departmentId)
        return (data || []).map((u: DbRecord) => ({ ...u, role: "GUEST" })) as unknown as UserData[]
      }
      throw err
    }
  },
  async listByIds(ids, options) {
    try {
      let query = supabase.from("users").select(USER_SELECT).in("id", ids)
      if (!options?.includeDeleted) {
        query = query.is("deletedAt", null)
      }
      const { data, error } = await query
      if (error) throw error
      return toUsersWithRoles(data)
    } catch (err) {
      if (isMissingUserrole(err as QueryError)) {
        const { data } = await supabase.from("users").select(USER_COLUMNS_NO_PASSWORD).in("id", ids)
        return (data || []).map((u: DbRecord) => ({ ...u, role: "GUEST" })) as unknown as UserData[]
      }
      throw err
    }
  },
  async listAll(options) {
    const BATCH = 1000
    try {
      const allData: DbRecord[] = []
      let offset = 0
      while (true) {
        let query = supabase
          .from("users")
          .select(USER_SELECT)
          .order("createdAt", { ascending: false })
          .range(offset, offset + BATCH - 1)
        if (!options?.includeDeleted) {
          query = query.is("deletedAt", null)
        }
        const { data, error } = await query
        if (error) throw error
        allData.push(...(data || []) as DbRecord[])
        if (!data || data.length < BATCH) break
        offset += BATCH
      }
      return toUsersWithRoles(allData)
    } catch (err) {
      if (isMissingUserrole(err as QueryError)) {
        const allData: DbRecord[] = []
        let offset = 0
        while (true) {
          let query = supabase
            .from("users")
            .select(USER_COLUMNS_NO_PASSWORD)
            .order("createdAt", { ascending: false })
            .range(offset, offset + BATCH - 1)
          if (!options?.includeDeleted) {
            query = query.is("deletedAt", null)
          }
          const { data } = await query
          allData.push(...(data || []) as DbRecord[])
          if (!data || data.length < BATCH) break
          offset += BATCH
        }
        return allData.map((u: DbRecord) => ({ ...u, role: "GUEST" })) as unknown as UserData[]
      }
      throw err
    }
  },
  async update(id, data) {
    const { role, ...userFields } = data
    if (userFields.email) userFields.email = userFields.email.toLowerCase().trim()
    if (Object.keys(userFields).length > 0) {
      const { error } = await supabase.from("users").update(userFields).eq("id", id)
      if (error) throw error
    }
    if (role) {
      const { error: delErr } = await supabase.from("userrole").delete().eq("userId", id)
      if (delErr) throw delErr
      const roleNames = role.split("|")
      for (const roleName of roleNames) {
        const { error: roleErr } = await supabase.from("userrole").insert({ userId: id, roleName })
        if (roleErr) throw roleErr
      }
    }
    const { data: updated, error: fetchErr } = await supabase.from("users").select(USER_SELECT).eq("id", id).single()
    if (fetchErr) throw fetchErr
    if (!updated) throw new Error("Failed to fetch updated user")
    const user = toUserWithRole(updated as Record<string, unknown>)
    const changes = Object.keys(userFields).concat(role ? ["role"] : []).join(", ")
    await logUserAction(user.email, "UPDATE_USER", `Updated user ${user.name}: ${changes}`)
    return user
  },
  async softDelete(id) {
    const user = await this.findById(id)
    const { error } = await supabase.from("users").update({ deletedAt: new Date().toISOString() }).eq("id", id)
    if (error) throw error
    if (user) await logUserAction(user.email, "DISABLE_USER", `Soft-deleted user: ${user.name}`)
  },
  async bulkSoftDelete(ids) {
    if (ids.length === 0) return
    const { data: users } = await supabase.from("users").select("id, email, name").in("id", ids)
    const { error } = await supabase.from("users").update({ deletedAt: new Date().toISOString() }).in("id", ids)
    if (error) throw error
    if (users) {
      for (const u of users as { email: string; name: string }[]) {
        await logUserAction(u.email, "DISABLE_USER", `Soft-deleted user: ${u.name}`)
      }
    }
  },
  async restore(id) {
    const user = await this.findById(id)
    const { error } = await supabase.from("users").update({ deletedAt: null }).eq("id", id)
    if (error) throw error
    if (user) await logUserAction(user.email, "ENABLE_USER", `Restored user: ${user.name}`)
  },
  async permanentDelete(id) {
    const user = await this.findById(id)
    const { error } = await supabase.from("users").delete().eq("id", id)
    if (error) throw error
    if (user) await logUserAction(user.email, "DELETE_USER", `Permanently deleted user: ${user.name}`)
  },
  async listDeleted() {
    try {
      const { data, error } = await supabase
        .from("users")
        .select(USER_SELECT)
        .not("deletedAt", "is", null)
        .order("deletedAt", { ascending: false })
      if (error) throw error
      return toUsersWithRoles(data)
    } catch (err) {
      if (isMissingUserrole(err as QueryError)) {
        const { data } = await supabase.from("users").select(USER_COLUMNS_NO_PASSWORD).not("deletedAt", "is", null)
        return (data || []).map((u: DbRecord) => ({ ...u, role: "GUEST" })) as unknown as UserData[]
      }
      throw err
    }
  },
  async countActive() {
    const { count, error } = await supabase
      .from("users")
      .select("id", { count: "exact", head: true })
      .is("deletedAt", null)
    if (error) throw error
    return count ?? 0
  },
  async countByRole(role) {
    const { count, error } = await supabase
      .from("userrole")
      .select("userId", { count: "exact", head: true })
      .eq("roleName", role)
    if (error) throw error
    return count ?? 0
  },
}
