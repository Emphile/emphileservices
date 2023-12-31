class AdminProfile:
    def __init__(self, username, password, permissions=[]):
        self.username = username
        self.password = password
        self.permissions = permissions

    def display_profile(self):
        print(f"Username: {self.username}")
        print(f"Password: {self.password}")
        print(f"Permissions: {', '.join(self.permissions)}")

# Example usage:
admin_user = AdminProfile(username="admin", password="securepassword", permissions=["manage_users", "configure_system"])

# Display the admin profile information
admin_user.display_profile()

