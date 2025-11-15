import { db } from './db.js';

// Helper function to generate slug
function generateSlug(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 50);
}

// Helper function to build full path
function buildFullPath(slug, parentPath = null) {
  if (!parentPath) {
    return `/${slug}`;
  }
  return `${parentPath}/${slug}`;
}

export const pathsDB = {
  /**
   * Get all root-level paths (level 1, no parent)
   */
  getRootPaths() {
    return db.prepare(`
      SELECT p.*,
        u.display_name as created_by_name,
        (SELECT COUNT(*) FROM paths WHERE parent_id = p.id) as child_count,
        (SELECT COUNT(*) FROM posts WHERE path_id = p.id) as post_count
      FROM paths p
      LEFT JOIN users u ON p.created_by = u.id
      WHERE p.parent_id IS NULL
      ORDER BY p.position ASC, p.name ASC
    `).all();
  },

  /**
   * Get children of a specific path
   */
  getChildPaths(parentId) {
    if (!parentId) {
      return this.getRootPaths();
    }

    return db.prepare(`
      SELECT p.*,
        u.display_name as created_by_name,
        (SELECT COUNT(*) FROM paths WHERE parent_id = p.id) as child_count,
        (SELECT COUNT(*) FROM posts WHERE path_id = p.id) as post_count
      FROM paths p
      LEFT JOIN users u ON p.created_by = u.id
      WHERE p.parent_id = ?
      ORDER BY p.position ASC, p.name ASC
    `).all(parentId);
  },

  /**
   * Get path by ID with full details
   */
  getPathById(id) {
    const path = db.prepare(`
      SELECT p.*,
        u.display_name as created_by_name,
        (SELECT COUNT(*) FROM paths WHERE parent_id = p.id) as child_count,
        (SELECT COUNT(*) FROM posts WHERE path_id = p.id) as post_count
      FROM paths p
      LEFT JOIN users u ON p.created_by = u.id
      WHERE p.id = ?
    `).get(id);

    if (!path) return null;

    // Get breadcrumb trail
    path.breadcrumbs = this.getBreadcrumbs(id);

    return path;
  },

  /**
   * Get path by full_path
   */
  getPathByFullPath(fullPath) {
    const path = db.prepare(`
      SELECT p.*,
        u.display_name as created_by_name,
        (SELECT COUNT(*) FROM paths WHERE parent_id = p.id) as child_count,
        (SELECT COUNT(*) FROM posts WHERE path_id = p.id) as post_count
      FROM paths p
      LEFT JOIN users u ON p.created_by = u.id
      WHERE p.full_path = ?
    `).get(fullPath);

    if (!path) return null;

    path.breadcrumbs = this.getBreadcrumbs(path.id);

    return path;
  },

  /**
   * Get breadcrumb trail for a path (all ancestors)
   */
  getBreadcrumbs(pathId) {
    const breadcrumbs = [];
    let currentId = pathId;

    while (currentId) {
      const path = db.prepare('SELECT id, name, slug, parent_id, full_path FROM paths WHERE id = ?').get(currentId);
      if (!path) break;

      breadcrumbs.unshift({
        id: path.id,
        name: path.name,
        slug: path.slug,
        full_path: path.full_path
      });

      currentId = path.parent_id;
    }

    return breadcrumbs;
  },

  /**
   * Get full tree structure starting from a path
   */
  getPathTree(parentId = null, maxDepth = 5) {
    const paths = parentId
      ? this.getChildPaths(parentId)
      : this.getRootPaths();

    if (maxDepth <= 0) {
      return paths;
    }

    return paths.map(path => ({
      ...path,
      children: this.getPathTree(path.id, maxDepth - 1)
    }));
  },

  /**
   * Create a new path
   */
  createPath(pathData, userId = null) {
    const { name, description = null, parent_id = null, icon = null, color = null, position = 0 } = pathData;

    if (!name || name.trim().length === 0) {
      throw new Error('Path name is required');
    }

    const slug = generateSlug(name);

    // Validate parent and calculate level
    let level = 1;
    let parentPath = null;

    if (parent_id) {
      const parent = db.prepare('SELECT id, level, full_path FROM paths WHERE id = ?').get(parent_id);
      if (!parent) {
        throw new Error('Parent path not found');
      }

      level = parent.level + 1;

      if (level > 5) {
        throw new Error('Maximum path depth (5 levels) exceeded');
      }

      parentPath = parent.full_path;
    }

    const full_path = buildFullPath(slug, parentPath);

    // Check for duplicate full_path
    const existing = db.prepare('SELECT id FROM paths WHERE full_path = ?').get(full_path);
    if (existing) {
      throw new Error(`Path "${full_path}" already exists`);
    }

    // Insert the new path
    const result = db.prepare(`
      INSERT INTO paths (name, slug, description, parent_id, level, full_path, icon, color, position, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(name, slug, description, parent_id, level, full_path, icon, color, position, userId);

    console.log(`📁 Created path: ${full_path} (ID: ${result.lastInsertRowid})`);

    return this.getPathById(result.lastInsertRowid);
  },

  /**
   * Update an existing path
   */
  updatePath(pathId, pathData, userId = null) {
    const { name, description, icon, color, position } = pathData;

    const existingPath = db.prepare('SELECT * FROM paths WHERE id = ?').get(pathId);
    if (!existingPath) {
      throw new Error('Path not found');
    }

    const updateData = {
      name: name || existingPath.name,
      description: description !== undefined ? description : existingPath.description,
      icon: icon !== undefined ? icon : existingPath.icon,
      color: color !== undefined ? color : existingPath.color,
      position: position !== undefined ? position : existingPath.position
    };

    // If name changed, regenerate slug and full_path
    let newSlug = existingPath.slug;
    let newFullPath = existingPath.full_path;

    if (name && name !== existingPath.name) {
      newSlug = generateSlug(name);
      
      // Get parent path if exists
      let parentPath = null;
      if (existingPath.parent_id) {
        const parent = db.prepare('SELECT full_path FROM paths WHERE id = ?').get(existingPath.parent_id);
        if (parent) {
          parentPath = parent.full_path;
        }
      }

      newFullPath = buildFullPath(newSlug, parentPath);

      // Check for conflicts
      const conflict = db.prepare('SELECT id FROM paths WHERE full_path = ? AND id != ?').get(newFullPath, pathId);
      if (conflict) {
        throw new Error(`Path "${newFullPath}" already exists`);
      }
    }

    // Update the path
    const result = db.prepare(`
      UPDATE paths 
      SET name = ?, slug = ?, description = ?, icon = ?, color = ?, position = ?,
          full_path = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      updateData.name, newSlug, updateData.description, updateData.icon,
      updateData.color, updateData.position, newFullPath, pathId
    );

    if (result.changes === 0) {
      throw new Error('Failed to update path');
    }

    // If full_path changed, update all descendants
    if (newFullPath !== existingPath.full_path) {
      this.updateDescendantPaths(pathId, existingPath.full_path, newFullPath);
    }

    console.log(`📝 Updated path: ${newFullPath} (ID: ${pathId})`);

    return this.getPathById(pathId);
  },

  /**
   * Update full_path for all descendants when parent path changes
   */
  updateDescendantPaths(pathId, oldFullPath, newFullPath) {
    const descendants = db.prepare(`
      SELECT id, full_path FROM paths 
      WHERE full_path LIKE ? AND id != ?
    `).all(`${oldFullPath}/%`, pathId);

    const updateStmt = db.prepare('UPDATE paths SET full_path = ? WHERE id = ?');

    descendants.forEach(desc => {
      const updatedPath = desc.full_path.replace(oldFullPath, newFullPath);
      updateStmt.run(updatedPath, desc.id);
      console.log(`  ↳ Updated descendant: ${updatedPath}`);
    });
  },

  /**
   * Move a path to a new parent
   */
  movePath(pathId, newParentId = null) {
    const path = db.prepare('SELECT * FROM paths WHERE id = ?').get(pathId);
    if (!path) {
      throw new Error('Path not found');
    }

    // Validate new parent
    let newLevel = 1;
    let newParentPath = null;

    if (newParentId) {
      const newParent = db.prepare('SELECT id, level, full_path FROM paths WHERE id = ?').get(newParentId);
      if (!newParent) {
        throw new Error('New parent path not found');
      }

      // Check if moving to a descendant (circular reference)
      if (newParent.full_path.startsWith(path.full_path + '/')) {
        throw new Error('Cannot move a path to its own descendant');
      }

      newLevel = newParent.level + 1;

      // Check depth limit
      const descendants = db.prepare(`
        SELECT MAX(level) as max_level FROM paths 
        WHERE full_path LIKE ?
      `).get(`${path.full_path}/%`);

      const maxDescendantDepth = descendants.max_level || path.level;
      const depthDelta = maxDescendantDepth - path.level;

      if (newLevel + depthDelta > 5) {
        throw new Error('Move would exceed maximum path depth (5 levels)');
      }

      newParentPath = newParent.full_path;
    }

    const oldFullPath = path.full_path;
    const newFullPath = buildFullPath(path.slug, newParentPath);

    // Check for conflicts
    const conflict = db.prepare('SELECT id FROM paths WHERE full_path = ? AND id != ?').get(newFullPath, pathId);
    if (conflict) {
      throw new Error(`Path "${newFullPath}" already exists`);
    }

    // Update the path
    const levelDelta = newLevel - path.level;

    db.prepare(`
      UPDATE paths 
      SET parent_id = ?, level = ?, full_path = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(newParentId, newLevel, newFullPath, pathId);

    // Update all descendants
    const descendants = db.prepare(`
      SELECT id, level, full_path FROM paths 
      WHERE full_path LIKE ?
    `).all(`${oldFullPath}/%`);

    const updateDescStmt = db.prepare('UPDATE paths SET level = ?, full_path = ? WHERE id = ?');

    descendants.forEach(desc => {
      const updatedPath = desc.full_path.replace(oldFullPath, newFullPath);
      const updatedLevel = desc.level + levelDelta;
      updateDescStmt.run(updatedLevel, updatedPath, desc.id);
    });

    console.log(`🔀 Moved path: ${oldFullPath} → ${newFullPath}`);

    return this.getPathById(pathId);
  },

  /**
   * Delete a path (and optionally its descendants)
   */
  deletePath(pathId, cascade = false) {
    const path = db.prepare('SELECT * FROM paths WHERE id = ?').get(pathId);
    if (!path) {
      throw new Error('Path not found');
    }

    // Check for children
    const children = db.prepare('SELECT COUNT(*) as count FROM paths WHERE parent_id = ?').get(pathId);
    if (children.count > 0 && !cascade) {
      throw new Error('Cannot delete path with children. Use cascade=true to delete children as well.');
    }

    // Check for posts
    const posts = db.prepare('SELECT COUNT(*) as count FROM posts WHERE path_id = ?').get(pathId);
    if (posts.count > 0 && !cascade) {
      throw new Error(`Cannot delete path with ${posts.count} posts. Move or delete posts first, or use cascade=true.`);
    }

    // If cascade, foreign keys will handle deletion of children
    // Posts will have path_id set to NULL (ON DELETE SET NULL)
    const result = db.prepare('DELETE FROM paths WHERE id = ?').run(pathId);

    if (result.changes === 0) {
      throw new Error('Failed to delete path');
    }

    console.log(`🗑️ Deleted path: ${path.full_path} (cascade: ${cascade})`);

    return { success: true, deleted: path.full_path };
  },

  /**
   * Search paths by name or description
   */
  searchPaths(query) {
    return db.prepare(`
      SELECT p.*,
        u.display_name as created_by_name,
        (SELECT COUNT(*) FROM paths WHERE parent_id = p.id) as child_count,
        (SELECT COUNT(*) FROM posts WHERE path_id = p.id) as post_count
      FROM paths p
      LEFT JOIN users u ON p.created_by = u.id
      WHERE p.name LIKE ? OR p.description LIKE ? OR p.full_path LIKE ?
      ORDER BY p.level ASC, p.name ASC
    `).all(`%${query}%`, `%${query}%`, `%${query}%`);
  },

  /**
   * Get all paths (flat list)
   */
  getAllPaths() {
    return db.prepare(`
      SELECT p.*,
        u.display_name as created_by_name,
        (SELECT COUNT(*) FROM paths WHERE parent_id = p.id) as child_count,
        (SELECT COUNT(*) FROM posts WHERE path_id = p.id) as post_count
      FROM paths p
      LEFT JOIN users u ON p.created_by = u.id
      ORDER BY p.full_path ASC
    `).all();
  },

  /**
   * Get path statistics
   */
  getPathStats(pathId = null) {
    if (pathId) {
      // Stats for specific path
      const path = this.getPathById(pathId);
      if (!path) {
        throw new Error('Path not found');
      }

      const descendants = db.prepare(`
        SELECT COUNT(*) as count FROM paths 
        WHERE full_path LIKE ?
      `).get(`${path.full_path}/%`);

      const allPosts = db.prepare(`
        SELECT COUNT(*) as count FROM posts 
        WHERE path_id IN (
          SELECT id FROM paths 
          WHERE full_path = ? OR full_path LIKE ?
        )
      `).get(path.full_path, `${path.full_path}/%`);

      return {
        path_id: pathId,
        path_name: path.name,
        full_path: path.full_path,
        direct_children: path.child_count,
        total_descendants: descendants.count,
        direct_posts: path.post_count,
        total_posts: allPosts.count
      };
    } else {
      // Global stats
      const totalPaths = db.prepare('SELECT COUNT(*) as count FROM paths').get();
      const rootPaths = db.prepare('SELECT COUNT(*) as count FROM paths WHERE parent_id IS NULL').get();
      const maxLevel = db.prepare('SELECT MAX(level) as max FROM paths').get();
      const pathsWithPosts = db.prepare('SELECT COUNT(DISTINCT path_id) as count FROM posts WHERE path_id IS NOT NULL').get();

      return {
        total_paths: totalPaths.count,
        root_paths: rootPaths.count,
        max_depth: maxLevel.max || 0,
        paths_with_posts: pathsWithPosts.count
      };
    }
  }
};