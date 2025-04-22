const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const db = require('./db');

const app = express();
const PORT = 3000;

app.use((req, res, next) => {
    // Sprawdzanie, czy sesja istnieje
    if (req.session && req.session.user) {
        res.locals.user = req.session.user; // Przekazanie danych użytkownika do wszystkich widoków
    } else {
        res.locals.user = null; // Brak użytkownika, jeśli sesja nie istnieje
    }
    next();
});


// Middleware
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.set('view engine', 'ejs');

app.use(session({
    secret: 'tajnehaslo',
    resave: false,
    saveUninitialized: true,
    cookie: { maxAge: 1000 * 60 * 60 * 24 } // Sesja trwa 24 godziny
}));


function isLoggedIn(req) {
    return req.session && req.session.user;
}

// Multer - konfiguracja uploadów
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/');
    },
    filename: (req, file, cb) => {
        const uniqueName = Date.now() + '-' + file.originalname;
        cb(null, uniqueName);
    }
});
const upload = multer({ storage });

// Tworzenie tabel, jeśli nie istnieją
db.run(`
    CREATE TABLE IF NOT EXISTS Ticket (
        Id_ticket INTEGER PRIMARY KEY AUTOINCREMENT,
        Id_sprawa INTEGER,
        Id_uzytkownik INTEGER,
        Tresc TEXT,
        Data DATETIME DEFAULT CURRENT_TIMESTAMP,
        Typ TEXT,
        FOREIGN KEY(Id_sprawa) REFERENCES Sprawa(Id_sprawa),
        FOREIGN KEY(Id_uzytkownik) REFERENCES Uzytkownik(id)
    )
`);
db.run(`
    CREATE TABLE IF NOT EXISTS Zalacznik (
        Id_zalacznik INTEGER PRIMARY KEY AUTOINCREMENT,
        Id_sprawa INTEGER,
        nazwa_pliku TEXT,
        data_dodania DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(Id_sprawa) REFERENCES Sprawa(Id_sprawa)
    )
`);

// Autoryzacja
app.get('/login', (req, res) => res.render('login'));
app.post('/login', (req, res) => {
    const { email, haslo } = req.body;
    db.get('SELECT * FROM Uzytkownik WHERE email = ? AND haslo = ?', [email, haslo], (err, user) => {
        if (err) return res.status(500).send('Błąd serwera');
        if (!user) return res.send('Nieprawidłowy login lub hasło');
        req.session.user = user;
        res.redirect('/');
    });
});

app.get('/register', (req, res) => res.render('register'));
app.post('/register', (req, res) => {
    const { imie, nazwisko, email, haslo, rola } = req.body;
    db.run('INSERT INTO Uzytkownik (imie, nazwisko, email, haslo, rola) VALUES (?, ?, ?, ?, ?)', [imie, nazwisko, email, haslo, rola], function(err) {
        if (err) return res.send('Błąd przy rejestracji: ' + err.message);
        res.redirect('/login');
    });
});

app.get('/logout', (req, res) => {
    req.session.destroy(() => res.redirect('/login'));
});

app.post('/logout', (req, res) => {
    req.session.destroy(err => {
        if (err) return res.status(500).send('Błąd podczas wylogowania');
        res.redirect('/login');
    });
});

// Strona główna
app.get('/', (req, res) => {
    if (!isLoggedIn(req)) return res.redirect('/login');

    const data = {};
    const user = req.session.user;

    db.all('SELECT * FROM Agent', [], (err, agents) => {
        if (err) return res.status(500).send(err.message);
        data.agents = agents;

        db.all('SELECT * FROM Kategoria', [], (err, categories) => {
            if (err) return res.status(500).send(err.message);
            data.categories = categories;

            const query = user.rola === 'ubezpieczony' ?
                'SELECT * FROM Sprawa WHERE Id_uzytkownik = ?' :
                'SELECT * FROM Sprawa';

            const params = user.rola === 'ubezpieczony' ? [user.id] : [];

            db.all(query, params, async(err, sprawy) => {
                if (err) return res.status(500).send(err.message);

                const sprawyPromises = sprawy.map(sprawa => {
                    return new Promise((resolve, reject) => {
                        db.all(`
                            SELECT Ticket.*, Uzytkownik.imie || ' ' || Uzytkownik.nazwisko AS Autor
                            FROM Ticket
                            LEFT JOIN Uzytkownik ON Ticket.Id_uzytkownik = Uzytkownik.id
                            WHERE Ticket.Id_sprawa = ?
                            ORDER BY Ticket.Data DESC
                        `, [sprawa.Id_sprawa], (err, tickets) => {
                            if (err) return reject(err);

                            db.all(`SELECT * FROM Zalacznik WHERE Id_sprawa = ?`, [sprawa.Id_sprawa], (err, zalaczniki) => {
                                if (err) return reject(err);

                                sprawa.tickets = tickets;
                                sprawa.zalaczniki = zalaczniki || [];
                                resolve(sprawa);
                            });
                        });
                    });
                });

                Promise.all(sprawyPromises)
                    .then(sprawyWithTickets => {
                        data.sprawy = sprawyWithTickets;
                        data.user = user;
                        res.render('index', data);
                    })
                    .catch(err => res.status(500).send("Błąd przy pobieraniu historii"));
            });
        });
    });
});

// Dodanie zgłoszenia
app.post('/zgloszenie', (req, res) => {
    if (!isLoggedIn(req)) return res.redirect('/login');

    const { Imie, Nazwisko, Adres, Telefon, Mail, Opis } = req.body;
    const userId = req.session.user.id;

    db.run(`
        INSERT INTO Sprawa 
        (Imie, Nazwisko, Id_kategoria, Adres, Telefon, Mail, Opis, Stan, Id_agent, Id_uzytkownik) 
        VALUES (?, ?, NULL, ?, ?, ?, ?, 'Oczekuje', NULL, ?)
    `, [Imie, Nazwisko, Adres, Telefon, Mail, Opis, userId], (err) => {
        if (err) return res.status(500).send("Błąd przy dodawaniu zgłoszenia");
        res.redirect('/');
    });
});

// Usuwanie sprawy
app.post('/sprawa/usun/:id', (req, res) => {
    if (!isLoggedIn(req) || req.session.user.rola !== 'ubezpieczyciel') {
        return res.status(403).send('Brak uprawnień');
    }

    db.run('DELETE FROM Sprawa WHERE Id_sprawa = ?', [req.params.id], err => {
        if (err) return res.status(500).send("Błąd przy usuwaniu sprawy");
        res.redirect('/');
    });
});

// Edycja sprawy
app.post('/sprawa/edytuj/:id', (req, res) => {
    if (!isLoggedIn(req) || req.session.user.rola !== 'ubezpieczyciel') {
        return res.status(403).send('Brak uprawnień');
    }

    const { Imie, Nazwisko, Id_kategoria, Adres, Telefon, Mail, Opis, Stan, Id_agent } = req.body;
    const id = req.params.id;

    db.get('SELECT * FROM Sprawa WHERE Id_sprawa = ?', [id], (err, oldSprawa) => {
        if (err || !oldSprawa) return res.status(500).send("Błąd przy pobieraniu starej wersji sprawy");

        db.run(`
            UPDATE Sprawa SET 
                Imie = ?, Nazwisko = ?, Id_kategoria = ?, Adres = ?, Telefon = ?, Mail = ?, 
                Opis = ?, Stan = ?, Id_agent = ? 
            WHERE Id_sprawa = ?
        `, [Imie, Nazwisko, Id_kategoria, Adres, Telefon, Mail, Opis, Stan, Id_agent, id], function(err) {
            if (err) return res.status(500).send("Błąd przy edycji sprawy");

            const zmiany = [];
            if (oldSprawa.Stan !== Stan) zmiany.push(`Status: ${oldSprawa.Stan} → ${Stan}`);
            if (oldSprawa.Id_agent !== Number(Id_agent)) zmiany.push(`Agent: ${oldSprawa.Id_agent ?? 'Brak'} → ${Id_agent || 'Brak'}`);

            if (zmiany.length) {
                const tresc = zmiany.join(', ');
                const idUzytkownik = req.session.user.id;

                db.run(`
                    INSERT INTO Ticket (Id_sprawa, Tresc, Data, Typ, Id_uzytkownik)
                    VALUES (?, ?, datetime('now'), ?, ?)
                `, [id, tresc, 'Automatyczna zmiana', idUzytkownik], err => {
                    if (err) console.error("Błąd zapisu ticketa:", err.message);
                    res.redirect('/');
                });
            } else {
                res.redirect('/');
            }
        });
    });
});

// Dodanie ticketa
app.post('/sprawa/:id/ticket', (req, res) => {
    if (!isLoggedIn(req) || req.session.user.rola !== 'ubezpieczyciel') {
        return res.status(403).send('Brak uprawnień');
    }

    const { Tresc } = req.body;
    db.run(`
        INSERT INTO Ticket (Id_sprawa, Id_uzytkownik, Tresc) 
        VALUES (?, ?, ?)
    `, [req.params.id, req.session.user.id, Tresc], err => {
        if (err) return res.status(500).send("Błąd przy dodawaniu ticketa");
        res.redirect('/');
    });
});

// Upload załącznika
app.post('/sprawa/:id/upload', upload.single('zalacznik'), (req, res) => {
    if (!isLoggedIn(req)) return res.redirect('/login');
    if (!req.file) return res.status(400).send('Nie wybrano pliku');

    db.run(`
        INSERT INTO Zalacznik (Id_sprawa, Nazwa_pliku)
        VALUES (?, ?)
    `, [req.params.id, req.file.filename], err => {
        if (err) return res.status(500).send('Błąd przy dodawaniu załącznika');
        res.redirect('/');
    });
});

// Usuwanie załącznika
app.post('/zalacznik/usun/:id', (req, res) => {
    if (!isLoggedIn(req)) return res.redirect('/login');

    db.get('SELECT * FROM Zalacznik WHERE Id_zalacznik = ?', [req.params.id], (err, zalacznik) => {
        if (err || !zalacznik) return res.status(500).send('Załącznik nie istnieje');

        const filePath = path.join(__dirname, 'uploads', zalacznik.Nazwa_pliku);
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

        db.run('DELETE FROM Zalacznik WHERE Id_zalacznik = ?', [req.params.id], err => {
            if (err) return res.status(500).send('Błąd przy usuwaniu załącznika');
            res.redirect('/');
        });
    });
});


//AGENT
// Panel Agenta - sprawy przypisane do zalogowanego agenta
app.get('/panel-agent', (req, res) => {
    if (!isLoggedIn(req) || req.session.user.rola !== 'agent') {
        return res.status(403).send('Brak dostępu');
    }

    const agentId = req.session.user.id;
    db.all(`
        SELECT * FROM Sprawa
        WHERE Id_agent = ?

    `, [agentId], (err, sprawy) => {
        if (err) return res.status(500).send('Błąd pobierania spraw');

        // Dla każdej sprawy pobieramy tickety
        const sprawyPromises = sprawy.map(sprawa => {
            return new Promise((resolve, reject) => {
                db.all(`
                    SELECT Ticket.*, Uzytkownik.imie || ' ' || Uzytkownik.nazwisko AS Autor
                    FROM Ticket
                    LEFT JOIN Uzytkownik ON Ticket.Id_uzytkownik = Uzytkownik.id
                    WHERE Ticket.Id_sprawa = ?
                    ORDER BY Ticket.Data DESC
                `, [sprawa.Id_sprawa], (err, tickets) => {
                    if (err) reject(err);
                    sprawa.tickets = tickets;
                    resolve(sprawa);
                });
            });
        });

        Promise.all(sprawyPromises)
            .then(sprawyWithTickets => {
                res.render('panel-agent', {
                    user: req.session.user,
                    sprawy: sprawyWithTickets
                });
            })
            .catch(err => res.status(500).send("Błąd przy pobieraniu ticketa"));
    });
});


app.get('/agent/sprawa/:id', (req, res) => {
    if (!isLoggedIn(req) || req.session.user.rola !== 'agent') {
        return res.status(403).send('Brak uprawnień');
    }

    const sprawaId = req.params.id;

    db.all('SELECT * FROM Ticket WHERE Id_sprawa = ?', [sprawaId], (err, tickets) => {
        if (err) {
            console.error("Błąd pobierania ticketów:", err.message);
            return res.status(500).send("Błąd przy pobieraniu ticketów");
        }

        // Pobierz dane sprawy
        db.get('SELECT * FROM Sprawa WHERE Id_sprawa = ?', [sprawaId], (err, sprawa) => {
            if (err || !sprawa) {
                console.error("Błąd pobierania sprawy:", err.message);
                return res.status(500).send("Błąd przy pobieraniu sprawy");
            }

            sprawa.tickets = tickets; // Przypisz pobrane tickety do sprawy

            res.render('panel-agent', { sprawa });
        });
    });
});

app.post('/agent/sprawa/:id/ticket', (req, res) => {
    if (!isLoggedIn(req) || req.session.user.rola !== 'agent') {
        return res.status(403).send('Brak uprawnień');
    }

    const sprawaId = req.params.id;
    const { Tresc, Typ } = req.body;

    // Dodaj nowy ticket
    db.run(`
        INSERT INTO Ticket (Id_sprawa, Id_uzytkownik, Tresc, Typ) 
        VALUES (?, ?, ?, ?)
    `, [sprawaId, req.session.user.id, Tresc, Typ], function(err) {
        if (err) {
            console.error("Błąd dodawania ticketa:", err.message);
            return res.status(500).send("Błąd przy dodawaniu ticketa");
        }
        res.redirect(`/panel-agent`);
    });
});


// Zmiana stanu sprawy

app.post('/agent/sprawa/:id/aktualizuj', async(req, res) => {
    if (!isLoggedIn(req) || req.session.user.rola !== 'agent') {
        return res.status(403).send('Brak dostępu');
    }

    const agentId = req.session.user.id;
    const sprawaId = req.params.id;
    const { Stan } = req.body; // Odczytujemy 'Stan' z formularza

    try {
        // Sprawdzenie, czy sprawa należy do danego agenta
        const sprawa = await db.get("SELECT * FROM Sprawa WHERE Id_sprawa = ? AND Id_agent = ?", [sprawaId, agentId]);

        if (!sprawa) {
            return res.status(404).send('Sprawa nie znaleziona');
        }

        // Aktualizowanie statusu sprawy w bazie
        await db.run("UPDATE Sprawa SET Stan = ? WHERE Id_sprawa = ?", [Stan, sprawaId]);

        // Przekierowanie na stronę szczegółów sprawy
        res.redirect(`/panel-agent/sprawa/${sprawaId}`);

    } catch (err) {
        console.error('Błąd podczas aktualizacji:', err);
        res.status(500).send("Błąd przy aktualizacji statusu sprawy");
    }
});

app.get('/panel-agent/sprawa/:id', async(req, res) => {
    if (!isLoggedIn(req) || req.session.user.rola !== 'agent') {
        return res.status(403).send('Brak dostępu');
    }

    const agentId = req.session.user.id;
    const sprawaId = req.params.id;

    try {
        // Pobieramy szczegóły sprawy z bazy danych
        const sprawa = await db.get("SELECT * FROM Sprawa WHERE Id_sprawa = ? AND Id_agent = ?", [sprawaId, agentId]);

        if (!sprawa) {
            return res.status(404).send('Sprawa nie znaleziona');
        }

        // Renderowanie strony z danymi sprawy (zakładam, że masz widok w EJS)
        res.redirect(`/panel-agent/`);
    } catch (err) {
        console.error('Błąd podczas ładowania sprawy:', err);
        res.status(500).send("Błąd przy ładowaniu danych sprawy");
    }
});


// Ścieżka do aktualizacji statusu sprawy na podstawie Id_ticket
app.post('/agent/update-status', (req, res) => {
    const { changeStatus, stan, Id_ticket } = req.body; // Pobieramy Id_ticket z formularza

    if (!isLoggedIn(req) || req.session.user.rola !== 'agent') {
        return res.status(403).send('Brak uprawnień');
    }

    // Sprawdź, czy użytkownik wybrał opcję zmiany statusu
    if (changeStatus === 'TAK' && stan) {
        // Przypisanie Id_ticket
        const ticketId = Id_ticket; // Upewnij się, że zmienna ticketId jest teraz zdefiniowana

        // Najpierw znajdź odpowiednią sprawę na podstawie Id_ticket
        db.get(`
                        SELECT Sprawa.Id_sprawa FROM Sprawa JOIN Ticket ON Sprawa.Id_sprawa = Ticket.Id_sprawa WHERE Ticket.Id_ticket = ?
                        `, [ticketId], (err, row) => {
            if (err) {
                console.error("Błąd przy pobieraniu sprawy:", err.message);
                return res.status(500).send("Błąd przy pobieraniu sprawy");
            }

            if (!row) {
                return res.status(404).send('Sprawa nie znaleziona');
            }

            const sprawaId = row.Id_sprawa;

            // Teraz, po znalezieniu odpowiedniej sprawy, zaktualizujemy jej status
            db.run(`
                        UPDATE Sprawa SET Stan = ?
                        WHERE Id_sprawa = ?
                        `, [stan, sprawaId], function(err) {
                if (err) {
                    console.error("Błąd przy aktualizacji statusu sprawy:", err.message);
                    return res.status(500).send("Błąd przy aktualizacji statusu sprawy");
                }

                // Po udanej aktualizacji, wróć do widoku z aktualnymi danymi
                res.redirect(` / agent / sprawa / $ { sprawaId }
                        `);
            });
        });
    } else {
        // Jeśli nie wybrano zmiany statusu, przekieruj do widoku bez zmian
        const ticketId = Id_ticket; // TicketId jest teraz dostępne
        res.redirect(` / agent / sprawa / $ { ticketId }
                        `);
    }
});




//STARE sprawy dla agenta
// // Panel Agenta - sprawy przypisane do zalogowanego agenta
// app.get('/panel-agent', (req, res) => {
//     if (!isLoggedIn(req) || req.session.user.rola !== 'agent') {
//         return res.status(403).send('Brak dostępu');
//     }

//     const agentId = req.session.user.id;
//     db.all(`
//         SELECT * FROM Sprawa
//         WHERE Id_agent = ?

//     `, [agentId], (err, sprawy) => {
//         if (err) return res.status(500).send('Błąd pobierania spraw');

//         // Dla każdej sprawy pobieramy tickety
//         const sprawyPromises = sprawy.map(sprawa => {
//             return new Promise((resolve, reject) => {
//                 db.all(`
//                     SELECT Ticket.*, Uzytkownik.imie || ' ' || Uzytkownik.nazwisko AS Autor
//                     FROM Ticket
//                     LEFT JOIN Uzytkownik ON Ticket.Id_uzytkownik = Uzytkownik.id
//                     WHERE Ticket.Id_sprawa = ?
//                     ORDER BY Ticket.Data DESC
//                 `, [sprawa.Id_sprawa], (err, tickets) => {
//                     if (err) reject(err);
//                     sprawa.tickets = tickets;
//                     resolve(sprawa);
//                 });
//             });
//         });

//         Promise.all(sprawyPromises)
//             .then(sprawyWithTickets => {
//                 res.render('panel-agent', {
//                     user: req.session.user,
//                     sprawy: sprawyWithTickets
//                 });
//             })
//             .catch(err => res.status(500).send("Błąd przy pobieraniu ticketa"));
//     });
// });

// app.post('/agent/sprawa/:id/aktualizuj', (req, res) => {
//     if (!isLoggedIn(req) || req.session.user.rola !== 'agent') {
//         return res.status(403).send('Brak uprawnień');
//     }

//     const sprawaId = req.params.id;
//     const { status, komentarz } = req.body;

//     db.run(`
//         UPDATE Sprawa
//         SET Stan = ?, Komentarz = ?
//         WHERE Id_sprawa = ? AND Id_agent = ?
//     `, [status, komentarz, sprawaId, req.session.user.id], function(err) {
//         if (err) {
//             console.error("Błąd aktualizacji sprawy:", err.message);
//             return res.status(500).send("Błąd przy aktualizacji sprawy");
//         }
//         res.redirect('/panel-agent');
//     });
// });

// app.post('/panel-agent/sprawa/:id/status', (req, res) => {
//     if (!isLoggedIn(req) || req.session.user.rola !== 'agent') {
//         return res.status(403).send('Brak dostępu');
//     }

//     const sprawaId = req.params.id;
//     const { nowyStatus } = req.body;
//     const userId = req.session.user.id;

//     db.run(`
//         UPDATE Sprawa SET Stan = ? WHERE Id_sprawa = ?
//     `, [nowyStatus, sprawaId], function(err) {
//         if (err) return res.status(500).send('Błąd aktualizacji statusu');

//         db.run(`
//             INSERT INTO Ticket (Id_sprawa, Tresc, Typ, Id_uzytkownik)
//             VALUES (?, ?, 'Status', ?)
//         `, [sprawaId, `Zmieniono status na: ${nowyStatus}`, userId], () => {
//             res.redirect('/panel-agent');
//         });
//     });
// });
// app.post('/panel-agent/sprawa/:id/komentarz', (req, res) => {
//     if (!isLoggedIn(req) || req.session.user.rola !== 'agent') {
//         return res.status(403).send('Brak dostępu');
//     }

//     const sprawaId = req.params.id;
//     const userId = req.session.user.id;
//     const { komentarz } = req.body;

// db.run(`
//     INSERT INTO Ticket (Id_sprawa, Tresc, Typ, Id_uzytkownik)
//     VALUES (?, ?, 'Komentarz', ?)
// `, [sprawaId, komentarz, userId], (err) => {
//     if (err) return res.status(500).send('Błąd dodawania komentarza');
//     res.redirect('/panel-agent');
// });
//});

app.listen(PORT, () => {
    console.log(`Serwer działa na http://localhost:${PORT}`);
});