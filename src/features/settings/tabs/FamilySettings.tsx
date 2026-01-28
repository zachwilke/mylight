import { useState, useEffect, useRef } from 'react';
import { Plus, Trash2, Upload, Edit2, Eye, EyeOff, X, Save } from 'lucide-react';
import { Button, Card, CardContent, Input } from '../../../components/ui';
import { Modal, ModalHeader, ModalTitle, ModalBody, ModalFooter } from '../../../components/ui';
import { UserAvatar } from '../../../components/UserAvatar';
import { ConfirmDialog } from '../../../components/ConfirmDialog';
import { FamilyMember } from '../../../types';

const COLORS = [
  { label: 'Blue', value: 'bg-blue-100 text-blue-800', hex: 'bg-blue-100' },
  { label: 'Pink', value: 'bg-pink-100 text-pink-800', hex: 'bg-pink-100' },
  { label: 'Green', value: 'bg-green-100 text-green-800', hex: 'bg-green-100' },
  { label: 'Purple', value: 'bg-purple-100 text-purple-800', hex: 'bg-purple-100' },
  { label: 'Orange', value: 'bg-orange-100 text-orange-800', hex: 'bg-orange-100' },
  { label: 'Teal', value: 'bg-teal-100 text-teal-800', hex: 'bg-teal-100' },
];

export function FamilySettings() {
  const [members, setMembers] = useState<FamilyMember[]>([]);
  const [loading, setLoading] = useState(true);

  // Add member form
  const [newMemberName, setNewMemberName] = useState('');
  const [newMemberEmail, setNewMemberEmail] = useState('');
  const [newMemberPassword, setNewMemberPassword] = useState('');
  const [newMemberPhone, setNewMemberPhone] = useState('');
  const [selectedColor, setSelectedColor] = useState(COLORS[0].value);

  // Edit member modal
  const [editingMember, setEditingMember] = useState<FamilyMember | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);

  // Delete confirmation
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<number | null>(null);

  const fileInputRefs = useRef<Record<number, HTMLInputElement | null>>({});

  useEffect(() => {
    fetch('/api/family')
      .then(res => res.json())
      .then(data => {
        setMembers(data);
        setLoading(false);
      })
      .catch(console.error);
  }, []);

  const addMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMemberName.trim() || !newMemberPassword.trim()) return;

    try {
      const res = await fetch('/api/family', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newMemberName,
          phone: newMemberPhone,
          email: newMemberEmail,
          password: newMemberPassword,
          color: selectedColor,
        }),
      });
      const newMember = await res.json();
      setMembers([...members, newMember]);
      setNewMemberName('');
      setNewMemberEmail('');
      setNewMemberPassword('');
      setNewMemberPhone('');
      setSelectedColor(COLORS[0].value);
    } catch (err) {
      console.error(err);
    }
  };

  const startEditing = (member: FamilyMember) => {
    setEditingMember({ ...member });
    setIsEditModalOpen(true);
  };

  const saveEditing = async () => {
    if (!editingMember) return;
    try {
      await fetch(`/api/family/${editingMember.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editingMember.name,
          phone: editingMember.phone,
          color: editingMember.color,
        }),
      });
      setMembers(members.map(m => (m.id === editingMember.id ? editingMember : m)));
      setIsEditModalOpen(false);
      setEditingMember(null);
    } catch (err) {
      console.error(err);
    }
  };

  const toggleVisibility = async (member: FamilyMember) => {
    const newVisible = member.visible === false ? true : false;
    try {
      const res = await fetch(`/api/family/${member.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ visible: newVisible }),
      });
      if (res.ok) {
        setMembers(members.map(m => (m.id === member.id ? { ...m, visible: newVisible } : m)));
      }
    } catch (err) {
      console.error(err);
    }
  };

  const confirmDeleteMember = async () => {
    if (!pendingDeleteId) return;
    try {
      await fetch(`/api/family/${pendingDeleteId}`, { method: 'DELETE' });
      setMembers(members.filter(m => m.id !== pendingDeleteId));
      setPendingDeleteId(null);
      setShowDeleteConfirm(false);
    } catch (err) {
      console.error(err);
    }
  };

  const handleAvatarUpload = async (id: number, file: File) => {
    if (!file) return;
    const formData = new FormData();
    formData.append('avatar', file);
    try {
      const res = await fetch(`/api/family/${id}/avatar`, {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (data.success) {
        setMembers(members.map(m => (m.id === id ? { ...m, avatar: data.avatar } : m)));
      }
    } catch (err) {
      console.error(err);
    }
  };

  const triggerFileInput = (id: number) => {
    fileInputRefs.current[id]?.click();
  };

  if (loading) return <div className="p-8 text-gray-400">Loading...</div>;

  return (
    <div className="space-y-6">
      <ConfirmDialog
        isOpen={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        onConfirm={confirmDeleteMember}
        title="Delete Family Member"
        message="Are you sure you want to delete this member? All their assigned chores and events will be deleted as well."
      />

      {/* Edit Member Modal */}
      <Modal isOpen={isEditModalOpen} onClose={() => setIsEditModalOpen(false)} size="md">
        <ModalHeader>
          <ModalTitle>Edit Member</ModalTitle>
        </ModalHeader>
        <ModalBody className="space-y-4">
          {editingMember && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1.5">
                  Name
                </label>
                <Input
                  type="text"
                  value={editingMember.name}
                  onChange={e => setEditingMember({ ...editingMember, name: e.target.value })}
                  placeholder="Name"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1.5">
                  Phone
                </label>
                <Input
                  type="tel"
                  value={editingMember.phone || ''}
                  onChange={e => setEditingMember({ ...editingMember, phone: e.target.value })}
                  placeholder="Phone (Optional)"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1.5">
                  Color
                </label>
                <div className="flex gap-2">
                  {COLORS.map(c => (
                    <button
                      key={c.value}
                      onClick={() => setEditingMember({ ...editingMember, color: c.value })}
                      className={`w-8 h-8 rounded-full ${c.hex} border-2 transition-all ${
                        editingMember.color === c.value
                          ? 'border-gray-600 dark:border-white scale-110'
                          : 'border-transparent hover:scale-110'
                      }`}
                    />
                  ))}
                </div>
              </div>
            </>
          )}
        </ModalBody>
        <ModalFooter>
          <Button variant="secondary" onClick={() => setIsEditModalOpen(false)}>
            Cancel
          </Button>
          <Button onClick={saveEditing}>
            <Save size={16} />
            Save
          </Button>
        </ModalFooter>
      </Modal>

      {/* Members Table */}
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 font-medium">
              <tr>
                <th className="px-6 py-3">Member</th>
                <th className="px-6 py-3">Contact</th>
                <th className="px-6 py-3 text-center">Visible</th>
                <th className="px-6 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {members.map(member => (
                <tr key={member.id} className="group hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                  <td className="px-6 py-3">
                    <div className="flex items-center gap-3">
                      <div
                        className="relative group/avatar cursor-pointer"
                        onClick={() => triggerFileInput(member.id)}
                      >
                        <UserAvatar member={member} size="sm" />
                        <div className="absolute inset-0 bg-black/40 rounded-full flex items-center justify-center opacity-0 group-hover/avatar:opacity-100 transition-opacity">
                          <Upload size={12} className="text-white" />
                        </div>
                        <input
                          type="file"
                          ref={el => {
                            fileInputRefs.current[member.id] = el;
                          }}
                          className="hidden"
                          accept="image/*"
                          onChange={e => {
                            if (e.target.files?.[0]) {
                              handleAvatarUpload(member.id, e.target.files[0]);
                            }
                          }}
                        />
                      </div>
                      <span
                        className={`font-medium transition-colors ${
                          member.visible === false
                            ? 'text-gray-400 dark:text-gray-600 line-through decoration-2'
                            : 'text-gray-900 dark:text-white'
                        }`}
                      >
                        {member.name}
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-3 text-gray-500 dark:text-gray-400">{member.phone || '-'}</td>
                  <td className="px-6 py-3 text-center">
                    <button
                      onClick={() => toggleVisibility(member)}
                      className={`p-1.5 rounded-md transition-colors ${
                        member.visible !== false
                          ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                          : 'bg-gray-100 text-gray-400 dark:bg-gray-800 dark:text-gray-500'
                      }`}
                      title={member.visible !== false ? 'Visible' : 'Hidden'}
                    >
                      {member.visible !== false ? <Eye size={16} /> : <EyeOff size={16} />}
                    </button>
                  </td>
                  <td className="px-6 py-3 text-right">
                    <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => startEditing(member)}
                        className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded transition-colors"
                        title="Edit"
                      >
                        <Edit2 size={16} />
                      </button>
                      <button
                        onClick={() => {
                          setPendingDeleteId(member.id);
                          setShowDeleteConfirm(true);
                        }}
                        className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded transition-colors"
                        title="Delete"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Add Member Form */}
        <CardContent className="bg-gray-50 dark:bg-gray-800/50 border-t border-gray-200 dark:border-gray-800">
          <form onSubmit={addMember} className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="space-y-3">
              <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider">
                Basic Info
              </label>
              <Input
                type="text"
                value={newMemberName}
                onChange={e => setNewMemberName(e.target.value)}
                placeholder="Name"
                required
              />
              <Input
                type="tel"
                value={newMemberPhone}
                onChange={e => setNewMemberPhone(e.target.value)}
                placeholder="Phone (Optional)"
              />
            </div>
            <div className="space-y-3">
              <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider">
                Credentials
              </label>
              <Input
                type="email"
                value={newMemberEmail}
                onChange={e => setNewMemberEmail(e.target.value)}
                placeholder="Email"
                required
              />
              <Input
                type="password"
                value={newMemberPassword}
                onChange={e => setNewMemberPassword(e.target.value)}
                placeholder="Password"
                required
              />
            </div>
            <div className="flex flex-col justify-between">
              <div className="space-y-3">
                <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider">
                  Appearance
                </label>
                <div className="flex flex-wrap gap-3">
                  {COLORS.map(c => (
                    <button
                      key={c.value}
                      type="button"
                      onClick={() => setSelectedColor(c.value)}
                      className={`w-10 h-10 rounded-full ${c.hex} transition-all ${
                        selectedColor === c.value
                          ? 'ring-2 ring-offset-2 ring-gray-400 scale-110'
                          : 'hover:scale-110'
                      }`}
                      title={c.label}
                    />
                  ))}
                </div>
              </div>
              <Button type="submit" className="mt-6 w-full" size="lg">
                <Plus size={18} />
                Add Member
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
