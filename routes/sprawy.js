const upload = require('../middleware/upload');

router.post('/:id/upload', upload.single('attachment'), async (req, res) => {
  try {
    const sprawa = await Sprawa.findById(req.params.id);
    if (!sprawa) return res.status(404).send('Sprawa nie znaleziona');

    sprawa.attachments.push(req.file.path);
    await sprawa.save();

    res.redirect(`/sprawy/${sprawa._id}`);
  } catch (err) {
    res.status(500).send('Błąd serwera');
  }
});
