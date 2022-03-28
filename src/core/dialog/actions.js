export const dialogActions = {
  SHOW_DIALOG: 'SHOW_DIALOG',
  CANCEL_DIALOG: 'CANCEL_DIALOG',

  show: ({ title, description, id, onConfirm, data }) => ({
    type: dialogActions.SHOW_DIALOG,
    payload: {
      title,
      data,
      description,
      id,
      onConfirm
    }
  }),

  cancel: () => ({
    type: dialogActions.CANCEL_DIALOG
  })
}
