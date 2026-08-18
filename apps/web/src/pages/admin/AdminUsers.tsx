import React, { useEffect, useState } from 'react';
import { getUsers } from '../../api/admin';
import type { User } from '../../api/admin';
import toast from 'react-hot-toast';

export const AdminUsers: React.FC = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getUsers()
      .then(setUsers)
      .catch((err) => {
        console.error('Failed to load users:', err);
        toast.error('Failed to load users');
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="text-center py-20 text-sm uppercase tracking-wider text-gray-400">Loading users...</div>;
  }

  return (
    <div className="bg-white border border-gray-200">
      {/* Page Header */}
      <div className="border-b border-gray-200 bg-gray-50">
        <div className="px-8 py-6">
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Manage Users</h1>
          <p className="text-sm text-gray-500 mt-1">
            {users.length} {users.length === 1 ? 'user' : 'users'}
          </p>
        </div>
      </div>

      <div className="p-0">
        <div className="overflow-hidden">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="p-4 text-xs font-semibold uppercase tracking-wider text-gray-500">ID / Username</th>
                <th className="p-4 text-xs font-semibold uppercase tracking-wider text-gray-500">Email</th>
                <th className="p-4 text-xs font-semibold uppercase tracking-wider text-gray-500">Status</th>
                <th className="p-4 text-xs font-semibold uppercase tracking-wider text-gray-500">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {users.map((user) => (
                <tr key={user.id} className="hover:bg-gray-50 transition-colors">
                  <td className="p-4 text-xs font-mono text-gray-400">{user.id}</td>
                  <td className="p-4 font-semibold text-sm text-gray-900">{user.email || 'N/A'}</td>
                  <td className="p-4 text-sm">
                    <span className={`px-2 py-1 text-xs font-semibold rounded-full ${user.enabled ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                      {user.status}
                    </span>
                  </td>
                  <td className="p-4 text-sm text-gray-500">{new Date(user.created).toLocaleDateString()}</td>
                </tr>
              ))}
              {users.length === 0 && (
                <tr>
                  <td colSpan={4} className="p-8 text-center text-gray-500 text-sm">No users found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
