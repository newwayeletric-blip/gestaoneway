migrate(
  (app) => {
    const users = app.findCollectionByNameOrId('_pb_users_auth_')

    // Add custom fields to users collection if not present
    if (!users.fields.getByName('profile')) {
      users.fields.add(
        new SelectField({
          name: 'profile',
          values: ['admin', 'vendedor'],
          maxSelect: 1,
          required: false,
        }),
      )
    }

    if (!users.fields.getByName('cpf')) {
      users.fields.add(
        new TextField({
          name: 'cpf',
          required: false,
        }),
      )
    }

    if (!users.fields.getByName('status')) {
      users.fields.add(
        new SelectField({
          name: 'status',
          values: ['ativo', 'inativo'],
          maxSelect: 1,
          required: false,
        }),
      )
    }

    if (!users.fields.getByName('cs_available')) {
      users.fields.add(
        new BoolField({
          name: 'cs_available',
          required: false,
        }),
      )
    }

    if (!users.fields.getByName('created_by')) {
      users.fields.add(
        new RelationField({
          name: 'created_by',
          collectionId: '_pb_users_auth_',
          maxSelect: 1,
          required: false,
        }),
      )
    }

    // Rules:
    // Admin can list/view/create/update/delete all users
    // Non-authenticated user can list nothing
    // Logged-in user can view/update self
    // Anonymous can create user ONLY if there is no user in the system yet (initial setup)
    users.listRule =
      "@request.auth.id != '' && (@request.auth.profile = 'admin' || id = @request.auth.id)"
    users.viewRule =
      "@request.auth.id != '' && (@request.auth.profile = 'admin' || id = @request.auth.id)"
    users.createRule = "@request.auth.profile = 'admin' || @request.auth.id = ''"
    users.updateRule =
      "@request.auth.id != '' && (@request.auth.profile = 'admin' || (id = @request.auth.id && @request.body.profile:changed = false && @request.body.status:changed = false))"
    users.deleteRule = "@request.auth.profile = 'admin'"

    app.save(users)
  },
  (app) => {
    // Revert changes
  },
)
