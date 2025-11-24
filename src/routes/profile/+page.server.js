import { fail, redirect } from '@sveltejs/kit';
import { userDB, blogDB } from '$lib/db.js';
import { hashPassword } from '$lib/auth.js';

export async function load({ locals }) {
  // Redirect to login if not authenticated
  if (!locals.user) {
    throw redirect(302, '/login');
  }

  try {
    // ✅ Load full user profile
    const user = await userDB.getUserById(locals.user.id);
    
    if (!user) {
      throw redirect(302, '/login');
    }

    // ✅ Load user's posts
    const posts = await blogDB.getPostsByUser(locals.user.id);

    console.log('👤 Profile loaded for:', user.email);
    console.log('📝 User posts:', posts.length);

    return {
      user,
      posts
    };
  } catch (error) {
    console.error('❌ Error loading profile:', error.message);
    return {
      user: locals.user,
      posts: []
    };
  }
}

export const actions = {
  // Change password action
  changePassword: async ({ request, locals }) => {
    if (!locals.user) {
      return fail(401, { error: 'Not authenticated' });
    }

    try {
      const data = await request.formData();
      const currentPassword = data.get('current_password')?.toString().trim();
      const newPassword = data.get('new_password')?.toString().trim();
      const confirmPassword = data.get('confirm_password')?.toString().trim();

      console.log('🔑 Password change attempt for:', locals.user.email);

      // Validation
      const errors = {};

      if (!currentPassword) {
        errors.current_password = 'Current password is required';
      }

      if (!newPassword || newPassword.length < 6) {
        errors.new_password = 'New password must be at least 6 characters';
      }

      if (newPassword !== confirmPassword) {
        errors.confirm_password = 'Passwords do not match';
      }

      if (Object.keys(errors).length > 0) {
        console.log('⚠️ Password validation failed');
        return fail(400, { errors, action: 'changePassword' });
      }

      // ✅ Change password using userDB
      const result = await userDB.changePassword(
        locals.user.id,
        currentPassword,
        newPassword
      );

      console.log('✅ Password changed successfully');

      return {
        success: true,
        message: 'Password changed successfully',
        action: 'changePassword'
      };
    } catch (error) {
      console.error('❌ Password change error:', error.message);

      if (error.message.includes('Current password is incorrect')) {
        return fail(400, {
          errors: { current_password: 'Current password is incorrect' },
          action: 'changePassword'
        });
      }

      return fail(500, {
        errors: { general: error.message },
        action: 'changePassword'
      });
    }
  },

  // Delete account action
  deleteAccount: async ({ request, locals }) => {
    if (!locals.user) {
      return fail(401, { error: 'Not authenticated' });
    }

    try {
      const data = await request.formData();
      const password = data.get('password')?.toString().trim();
      const reason = data.get('reason')?.toString().trim() || 'User requested';

      console.log('🗑️ Account deletion attempt for:', locals.user.email);

      // Validate password
      if (!password) {
        return fail(400, {
          errors: { password: 'Password is required to delete account' },
          action: 'deleteAccount'
        });
      }

      // Verify password before deletion
      const isValid = await userDB.verifyPassword(locals.user.id, password);

      if (!isValid) {
        console.log('❌ Invalid password for account deletion');
        return fail(400, {
          errors: { password: 'Password is incorrect' },
          action: 'deleteAccount'
        });
      }

      // ✅ Delete account using userDB
      const result = await userDB.completeAccountDeletion(locals.user.id, reason);

      console.log('✅ Account deleted successfully:', result.deletedPosts, 'posts removed');

      // Redirect to home (since account is deleted, no need to keep auth)
      throw redirect(303, '/');
    } catch (error) {
      // Allow redirects
      if (error.status === 303) {
        throw error;
      }

      console.error('❌ Account deletion error:', error.message);

      return fail(500, {
        errors: { general: error.message || 'Failed to delete account' },
        action: 'deleteAccount'
      });
    }
  }
};
