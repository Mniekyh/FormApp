const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const path = require('path');
const db = require('./db');

const app = express();
const PORT = 3000;

app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.set('view engine', 'ejs');

app.use(session({
    secret: 'tajnehaslo',
    resave: false,
    saveUninitialized: true
}));

function isLoggedIn(req) {
    return req.session && req.session.user;
}

// Utworzenie tabeli Ticket (jeśli nie istnieje)
db.run(`
    CREATE TABLE IF NOT EXISTS Ticket (
        Id_ticket INTEGER PRIMARY KEY AUTOINCREMENT,
        Id_sprawa INTEGER,
        Tresc TEXT,
        Data DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(Id_sprawa) REFERENCES Sprawa(Id_sprawa)
    )
`);

// Login
app.get('/login', (req, res) => {
    res.render('login');
});

app.post('/login', (req, res) => {
    const { email, haslo } = req.body;
    db.get('SELECT * FROM Uzytkownik WHERE email = ? AND haslo = ?', [email, haslo], (err, user) => {
        if (err) return res.status(500).send('Błąd serwera');
        if (!user) return res.send('Nieprawidłowy login lub hasło');
        req.session.user = user;
        res.redirect('/');
    });
});

// Rejestracja
app.get('/register', (req, res) => {
    res.render('register');
});

app.post('/register', (req, res) => {
    const { imie, nazwisko, email, haslo, rola } = req.body;
    db.run('INSERT INTO Uzytkownik (imie, nazwisko, email, haslo, rola) VALUES (?, ?, ?, ?, ?)',
        [imie, nazwisko, email, haslo, rola], function(err) {
            if (err) return res.send('Błąd przy rejestracji: ' + err.message);
            res.redirect('/login');
        });
});

// Logout
app.get('/logout', (req, res) => {
    req.session.destroy(() => {
        res.redirect('/login');
    });
});

app.post('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            console.error('Błąd podczas wylogowania:', err);
            return res.status(500).send('Błąd podczas wylogowania');
        }
        res.redirect('/login');
    });
});

// Strona główna z historią ticketów
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

            const query = user.rola === 'ubezpieczony'
                ? 'SELECT * FROM Sprawa WHERE Id_uzytkownik = ?'
                : 'SELECT * FROM Sprawa';

            const params = user.rola === 'ubezpieczony' ? [user.id] : [];

            db.all(query, params, (err, sprawy) => {
                if (err) return res.status(500).send(err.message);
                data.sprawy = sprawy;
                data.user = user;

                // Pobierz tickety
                db.all('SELECT * FROM Ticket', [], (err, tickets) => {
                    if (err) {
                        console.error("Błąd przy pobieraniu historii:", err.message);
                        return res.status(500).send('Błąd przy pobieraniu historii');
                    }
                    data.tickets = tickets;
                    res.render('index', data);
                });
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
        if (err) {
            console.error("Błąd dodawania sprawy:", err.message);
            return res.status(500).send("Błąd przy dodawaniu zgłoszenia");
        }
        res.redirect('/');
    });
});

// Usuwanie sprawy
app.post('/sprawa/usun/:id', (req, res) => {
    if (!isLoggedIn(req) || req.session.user.rola !== 'ubezpieczyciel') {
        return res.status(403).send('Brak uprawnień');
    }

    const id = req.params.id;
    db.run('DELETE FROM Sprawa WHERE Id_sprawa = ?', [id], (err) => {
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

    db.run(`UPDATE Sprawa SET 
        Imie = ?, Nazwisko = ?, Id_kategoria = ?, Adres = ?, Telefon = ?, Mail = ?, 
        Opis = ?, Stan = ?, Id_agent = ? WHERE Id_sprawa = ?`,
        [Imie, Nazwisko, Id_kategoria, Adres, Telefon, Mail, Opis, Stan, Id_agent, id],
        (err) => {
            if (err) return res.status(500).send("Błąd przy edycji sprawy");
            res.redirect('/');
        });
});

// Dodanie ticketa do sprawy
app.post('/sprawa/:id/ticket', (req, res) => {
    if (!isLoggedIn(req) || req.session.user.rola !== 'ubezpieczyciel') {
        return res.status(403).send('Brak uprawnień');
    }

    const sprawaId = req.params.id;
    const userId = req.session.user.id;
    const { Tresc } = req.body;

    db.run(`INSERT INTO Ticket (Id_sprawa, Id_uzytkownik, Tresc) VALUES (?, ?, ?)`,
        [sprawaId, userId, Tresc],
        (err) => {
            if (err) {
                console.error("Błąd dodawania ticketa:", err.message);
                return res.status(500).send("Błąd przy dodawaniu ticketa");
            }
            res.redirect('/');
        });
});


app.listen(PORT, () => {
    console.log(`Serwer działa na http://localhost:${PORT}`);
});
