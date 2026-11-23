import { useState, useCallback, useMemo } from "react";
import {
  UsersIcon,
  ShieldCheckIcon,
  UserPlusIcon,
  ArrowPathIcon,
  ExclamationCircleIcon,
  CheckCircleIcon,
  MagnifyingGlassIcon,
  XMarkIcon,
  InformationCircleIcon,
} from "@heroicons/react/24/outline";
import {
  PageHeader,
  MetricTile,
  Card,
  Button,
  Modal,
  Badge,
  Input,
  Select,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  EmptyState,
} from "../components/ui";

const INITIAL_USERS = [
  {
    id: 1,
    username: "ru.admin",
    full_name: "RU Claims Administrator",
    email: "admin.ruclaims@indonesiare.co.id",
    role: "admin",
    is_active: true,
    created_at: "2026-01-12T08:30:00+07:00",
    last_login_at: "2026-11-19T09:15:00+07:00",
    is_current: true,
  },
  {
    id: 2,
    username: "os.operator1",
    full_name: "Claims Reconciliation Operator",
    email: "operator.os1@indonesiare.co.id",
    role: "operator",
    is_active: true,
    created_at: "2026-02-04T10:00:00+07:00",
    last_login_at: "2026-11-18T16:40:00+07:00",
  },
  {
    id: 3,
    username: "os.operator2",
    full_name: "Bordereau Ingestion Specialist",
    email: "operator.os2@indonesiare.co.id",
    role: "operator",
    is_active: true,
    created_at: "2026-03-19T14:20:00+07:00",
    last_login_at: "2026-11-15T11:05:00+07:00",
  },
  {
    id: 4,
    username: "claims.viewer",
    full_name: "Technical Audit Reviewer",
    email: "auditor.claims@indonesiare.co.id",
    role: "viewer",
    is_active: false,
    created_at: "2026-05-08T09:45:00+07:00",
    last_login_at: null,
  },
];

const INITIAL_FORM = {
  username: "",
  email: "",
  full_name: "",
  password: "",
  role: "operator",
};

function formatDate(isoStr) {
  if (!isoStr) return { date: "-", time: "" };
  try {
    const d = new Date(isoStr);
    return {
      date: d.toLocaleDateString("id-ID", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      }),
      time: d.toLocaleTimeString("id-ID", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }),
    };
  } catch {
    return { date: isoStr, time: "" };
  }
}

export default function UserManagementPage() {
  const [users, setUsers] = useState(INITIAL_USERS);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("ALL");

  const [formData, setFormData] = useState(INITIAL_FORM);
  const [formLoading, setFormLoading] = useState(false);
  const [formError, setFormError] = useState("");
  const [formSuccess, setFormSuccess] = useState("");

  const handleCloseModal = useCallback(() => {
    setModalOpen(false);
    setFormError("");
    setFormSuccess("");
    setFormData(INITIAL_FORM);
  }, []);

  const handleOpenModal = useCallback(() => {
    setFormError("");
    setFormSuccess("");
    setFormData(INITIAL_FORM);
    setModalOpen(true);
  }, []);

  const handleRefresh = useCallback(() => {
    setLoading(true);
    setTimeout(() => setLoading(false), 300);
  }, []);

  const handleToggleStatus = useCallback((targetUser) => {
    if (targetUser.is_current) return;
    setUsers((prev) =>
      prev.map((u) =>
        u.id === targetUser.id ? { ...u, is_active: !u.is_active } : u
      )
    );
  }, []);

  const handleCreateUser = (e) => {
    e.preventDefault();
    const trimmedName = formData.full_name.trim();
    const trimmedUser = formData.username.trim().toLowerCase();
    const trimmedEmail = formData.email.trim();

    if (!trimmedName || !trimmedUser || !trimmedEmail || !formData.password.trim()) {
      setFormError("Semua field wajib diisi.");
      return;
    }
    if (formData.password.length < 6) {
      setFormError("Password awal minimal 6 karakter.");
      return;
    }
    if (users.some((u) => u.username.toLowerCase() === trimmedUser)) {
      setFormError(`Username "@${trimmedUser}" sudah terdaftar.`);
      return;
    }

    setFormLoading(true);
    setFormError("");
    setFormSuccess("");

    setTimeout(() => {
      const nextId = users.reduce((max, u) => Math.max(max, u.id), 0) + 1;
      const newUser = {
        id: nextId,
        username: trimmedUser,
        full_name: trimmedName,
        email: trimmedEmail,
        role: formData.role,
        is_active: true,
        created_at: new Date().toISOString(),
        last_login_at: null,
      };
      setUsers((prev) => [newUser, ...prev]);
      setFormLoading(false);
      setFormSuccess(`Akun "@${trimmedUser}" berhasil ditambahkan ke daftar workspace.`);
      setTimeout(() => {
        handleCloseModal();
      }, 900);
    }, 250);
  };

  const totalUsers = users.length;
  const activeUsers = useMemo(() => users.filter((u) => u.is_active).length, [users]);
  const adminUsers = useMemo(() => users.filter((u) => u.role === "admin").length, [users]);
  const operatorUsers = useMemo(
    () => users.filter((u) => u.role === "operator" || u.role === "viewer").length,
    [users]
  );
  const activeRate = totalUsers > 0 ? (activeUsers / totalUsers) * 100 : 100;

  const filteredUsers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return users.filter((u) => {
      const matchesRole = roleFilter === "ALL" || u.role === roleFilter;
      const matchesSearch =
        q === "" ||
        u.full_name?.toLowerCase().includes(q) ||
        u.username?.toLowerCase().includes(q) ||
        u.email?.toLowerCase().includes(q);
      return matchesRole && matchesSearch;
    });
  }, [users, roleFilter, searchQuery]);

  return (
    <div className="mx-auto w-full max-w-[1600px] px-4 sm:px-6 py-6 space-y-5 font-sans text-[var(--color-ink)] saas-page-enter">
      {/* Header & Actions */}
      <PageHeader
        title="User Management"
        description="Kelola akun pengguna portal RU Claims, peran otorisasi (RBAC), dan status akses tim."
        actions={
          <div className="flex items-center gap-2.5 shrink-0">
            <Button
              variant="secondary"
              size="sm"
              icon={ArrowPathIcon}
              onClick={handleRefresh}
              loading={loading}
              title="Refresh daftar pengguna"
            >
              Refresh
            </Button>
            <Button
              variant="primary"
              size="sm"
              icon={UserPlusIcon}
              onClick={handleOpenModal}
            >
              Add User
            </Button>
          </div>
        }
      />

      {/* UI Preview Mode Banner */}
      <div className="bg-[var(--color-brand-soft)] border border-[var(--color-brand-line)] rounded-[var(--radius-surface)] px-4 py-3 flex items-start gap-2.5 text-xs">
        <InformationCircleIcon className="w-4 h-4 text-[var(--color-brand)] shrink-0 mt-0.5" />
        <p className="text-[var(--color-ink-body)] leading-relaxed">
          <strong className="text-[var(--color-brand)]">UI Preview Mode</strong> &mdash;
          Tampilan manajemen akun dan peran (RBAC) sudah siap digunakan untuk simulasi. Integrasi penuh dengan layanan autentikasi dan database pengguna akan dihubungkan pada tahap pengembangan Auth berikutnya.
        </p>
      </div>

      {/* 4 Metric KPI Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricTile
          label="Total Registered Users"
          value={totalUsers.toLocaleString("id-ID")}
          hint="Seluruh akun terdaftar lintas peran"
          icon={UsersIcon}
          accent="brand"
          loading={loading}
          type="none"
        />

        <MetricTile
          label="Active Accounts"
          value={activeUsers.toLocaleString("id-ID")}
          hint={`${activeRate.toFixed(0)}% rasio akun aktif`}
          icon={CheckCircleIcon}
          accent="valid"
          loading={loading}
          type="progress"
          progressValue={activeRate}
          progressLabel="Active Ratio"
          progressColor="var(--color-valid)"
        />

        <MetricTile
          label="Administrators"
          value={adminUsers.toLocaleString("id-ID")}
          unit="Admins"
          hint="Akses penuh keamanan & konfigurasi"
          icon={ShieldCheckIcon}
          accent="premi"
          loading={loading}
          type="none"
        />

        <MetricTile
          label="Operators & Viewers"
          value={operatorUsers.toLocaleString("id-ID")}
          unit="Members"
          hint="Upload Excel, Master Data & OSCLN"
          icon={UsersIcon}
          accent="claim"
          loading={loading}
          type="none"
        />
      </div>

      {/* Main User Directory Card */}
      <Card
        title="User Directory & Access Control"
        description="Daftar anggota tim workspace RU Claims, peran keamanan, dan status aktivasi akun"
        badge={`${filteredUsers.length} Users`}
        padding="none"
      >
        {/* Search & Filter Toolbar */}
        <div className="p-4 border-b border-[var(--color-line)] bg-[var(--color-surface)]">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            {/* Search Input */}
            <div className="relative flex-1 max-w-md">
              <MagnifyingGlassIcon className="w-4 h-4 text-[var(--color-ink-muted)] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                placeholder="Cari nama, username, atau email..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-9 h-9 bg-[var(--color-surface-sunken)] border border-[var(--color-line)] rounded-[var(--radius-control)] text-[13px] text-[var(--color-ink)] placeholder-[var(--color-ink-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--color-brand)]/20 focus:border-[var(--color-brand)] transition-all font-medium"
              />
              {searchQuery && (
                <button
                  type="button"
                  aria-label="Hapus pencarian pengguna"
                  onClick={() => setSearchQuery("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--color-ink-muted)] hover:text-[var(--color-ink)] cursor-pointer"
                >
                  <XMarkIcon className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Role Filter & Reset */}
            <div className="flex items-center gap-2">
              <div className="w-44">
                <Select
                  id="filter_role"
                  aria-label="Filter berdasarkan peran"
                  value={roleFilter}
                  onChange={(e) => setRoleFilter(e.target.value)}
                  options={[
                    { value: "ALL", label: "All Roles" },
                    { value: "admin", label: "Administrator" },
                    { value: "operator", label: "Operator" },
                    { value: "viewer", label: "Viewer" },
                  ]}
                  className="h-9 py-1.5 text-[13px] bg-[var(--color-surface-sunken)]"
                />
              </div>

              {(searchQuery || roleFilter !== "ALL") && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setSearchQuery("");
                    setRoleFilter("ALL");
                  }}
                  icon={XMarkIcon}
                  title="Reset filter"
                >
                  Reset
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* Users Table */}
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>User Account</TableHead>
              <TableHead>Username</TableHead>
              <TableHead>Email Address</TableHead>
              <TableHead align="center">Role</TableHead>
              <TableHead align="center">Status</TableHead>
              <TableHead>Registered At</TableHead>
              <TableHead>Last Activity</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredUsers.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="py-10">
                  <EmptyState
                    title="Tidak ada pengguna ditemukan"
                    description={
                      searchQuery
                        ? `Tidak ada akun yang cocok dengan pencarian "${searchQuery}".`
                        : "Belum ada akun pengguna terdaftar."
                    }
                    action={
                      <Button
                        variant="primary"
                        size="sm"
                        icon={UserPlusIcon}
                        onClick={handleOpenModal}
                      >
                        Add New User
                      </Button>
                    }
                  />
                </TableCell>
              </TableRow>
            ) : (
              filteredUsers.map((u) => {
                const isAdmin = u.role === "admin";
                const createdTime = formatDate(u.created_at);
                const lastLoginTime = formatDate(u.last_login_at);

                return (
                  <TableRow key={u.id}>
                    {/* User Account */}
                    <TableCell className="whitespace-nowrap">
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-8 h-8 rounded-[var(--radius-control)] flex items-center justify-center font-bold text-xs shrink-0 ${
                            isAdmin
                              ? "bg-[var(--color-brand)] text-white shadow-sm"
                              : "bg-[var(--color-brand-soft)] text-[var(--color-brand)] border border-[var(--color-brand-line)]"
                          }`}
                        >
                          {u.full_name
                            ? u.full_name.charAt(0).toUpperCase()
                            : u.username.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-[var(--color-ink)] text-[13px]">
                              {u.full_name}
                            </span>
                            {u.is_current && (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[var(--color-valid-soft)] text-[var(--color-valid)] border border-[var(--color-valid)]/30">
                                You
                              </span>
                            )}
                          </div>
                          <span className="text-xs text-[var(--color-ink-muted)] block">
                            ID: #{u.id}
                          </span>
                        </div>
                      </div>
                    </TableCell>

                    {/* Username */}
                    <TableCell className="font-mono text-[13px] text-[var(--color-ink)] font-medium whitespace-nowrap">
                      @{u.username}
                    </TableCell>

                    {/* Email */}
                    <TableCell className="text-[var(--color-ink)] whitespace-nowrap">
                      {u.email}
                    </TableCell>

                    {/* Role */}
                    <TableCell align="center">
                      <Badge
                        tone={
                          isAdmin
                            ? "brand"
                            : u.role === "operator"
                              ? "premi"
                              : "neutral"
                        }
                      >
                        {u.role ? u.role.toUpperCase() : "OPERATOR"}
                      </Badge>
                    </TableCell>

                    {/* Interactive Status Pill */}
                    <TableCell align="center">
                      <button
                        type="button"
                        disabled={Boolean(u.is_current)}
                        onClick={() => handleToggleStatus(u)}
                        title={
                          u.is_current
                            ? "Akun sesi aktif saat ini"
                            : `Klik untuk mengubah status menjadi ${u.is_active ? "Inactive" : "Active"}`
                        }
                        className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold transition-opacity ${
                          u.is_current ? "cursor-default" : "cursor-pointer hover:opacity-80"
                        } ${
                          u.is_active
                            ? "bg-[var(--color-valid-soft)] text-[var(--color-valid)] border border-[var(--color-valid)]/30"
                            : "bg-[var(--color-surface-sunken)] text-[var(--color-ink-muted)] border border-[var(--color-line)]"
                        }`}
                      >
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${
                            u.is_active ? "bg-[var(--color-valid)]" : "bg-[var(--color-ink-muted)]"
                          }`}
                        />
                        {u.is_active ? "Active" : "Inactive"}
                      </button>
                    </TableCell>

                    {/* Registered At */}
                    <TableCell className="whitespace-nowrap">
                      <span className="text-xs font-medium text-[var(--color-ink)] block">
                        {createdTime.date}
                      </span>
                      <span className="text-xs font-mono text-[var(--color-ink-muted)]">
                        {createdTime.time}
                      </span>
                    </TableCell>

                    {/* Last Login */}
                    <TableCell className="whitespace-nowrap">
                      {u.last_login_at ? (
                        <>
                          <span className="text-xs font-medium text-[var(--color-ink)] block">
                            {lastLoginTime.date}
                          </span>
                          <span className="text-xs font-mono text-[var(--color-ink-muted)]">
                            {lastLoginTime.time}
                          </span>
                        </>
                      ) : (
                        <span className="text-xs text-[var(--color-ink-muted)] italic">
                          Never
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </Card>

      {/* Add User Modal */}
      <Modal
        open={modalOpen}
        onClose={handleCloseModal}
        title="Add New User Account"
        description="Daftarkan anggota tim baru dengan hak akses berbasis peran (RBAC) ke workspace."
        size="md"
        actions={
          <div className="flex items-center justify-end gap-2.5 w-full">
            <Button
              variant="secondary"
              onClick={handleCloseModal}
              disabled={formLoading}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleCreateUser}
              loading={formLoading}
              icon={UserPlusIcon}
            >
              Register User
            </Button>
          </div>
        }
      >
        <form onSubmit={handleCreateUser} className="space-y-4 text-[13px]">
          {formError && (
            <div
              role="alert"
              className="p-3 bg-[var(--color-danger-soft)] border border-[var(--color-danger)]/30 rounded-[var(--radius-control)] text-[var(--color-danger)] flex items-center gap-2 text-xs"
            >
              <ExclamationCircleIcon className="w-4 h-4 shrink-0" />
              <span>{formError}</span>
            </div>
          )}

          {formSuccess && (
            <div className="p-3 bg-[var(--color-valid-soft)] border border-[var(--color-valid)]/30 rounded-[var(--radius-control)] text-[var(--color-valid)] flex items-center gap-2 text-xs">
              <CheckCircleIcon className="w-4 h-4 shrink-0" />
              <span>{formSuccess}</span>
            </div>
          )}

          <Input
            id="field_full_name"
            label="Full Name"
            placeholder="Masukkan nama lengkap"
            value={formData.full_name}
            onChange={(e) =>
              setFormData((prev) => ({ ...prev, full_name: e.target.value }))
            }
            required
            autoComplete="name"
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              id="field_username"
              label="Username"
              placeholder="Contoh: operator.os3"
              value={formData.username}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, username: e.target.value }))
              }
              required
              autoComplete="username"
            />

            <Select
              id="field_role"
              label="Authorization Role"
              value={formData.role}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, role: e.target.value }))
              }
              options={[
                { value: "operator", label: "Operator (Upload & Reconcile)" },
                { value: "admin", label: "Administrator (Full Access)" },
                { value: "viewer", label: "Viewer (Read Only)" },
              ]}
            />
          </div>

          <Input
            id="field_email"
            type="email"
            label="Corporate Email Address"
            placeholder="nama@indonesiare.co.id"
            value={formData.email}
            onChange={(e) =>
              setFormData((prev) => ({ ...prev, email: e.target.value }))
            }
            required
            autoComplete="email"
          />

          <Input
            id="field_password"
            type="password"
            label="Initial Account Password"
            placeholder="Minimal 6 karakter"
            value={formData.password}
            onChange={(e) =>
              setFormData((prev) => ({ ...prev, password: e.target.value }))
            }
            required
            autoComplete="new-password"
          />
        </form>
      </Modal>
    </div>
  );
}
