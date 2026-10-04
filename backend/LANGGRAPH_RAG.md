# RAG contrôlé Aitheris

L’espace `/rag-workflows` propose des analyses sur les documents sélectionnés du compte connecté. Le chat existant reste disponible.

## Projets et collaboration

Choisir ou créer un projet dans RAG contrôlé, lui ajouter des documents de la bibliothèque, puis sélectionner les sources de l'analyse. Un même document peut appartenir à plusieurs projets personnels sans dupliquer ses vecteurs. La recherche reste filtrée par les identifiants de documents autorisés et leur propriétaire. Le rattachement au projet est contrôlé à la lecture et à chaque reprise, en plus de l'empreinte documentaire.

La migration `20260920_03` rattache les documents et analyses existants à un « Espace personnel » par utilisateur. Les nouveaux comptes créent leur premier projet depuis l'écran. L'API de création d'analyse exige désormais `project_id`, tout comme le filtre d'historique. Les anciennes conversations du chat restent dans leur bibliothèque personnelle. L'archivage et le retrait de documents via l'interface ne sont pas encore proposés.

La migration `20260920_04` ajoute les membres sans partager automatiquement aucun projet. Dans « Membres et partage », le propriétaire ajoute un compte existant par son identifiant exact, change son rôle ou retire son accès. Aucun courriel n'est envoyé.

| Rôle | Consulter documents et analyses | Ajouter ses documents / lancer et reprendre | Approuver ou rejeter | Gérer les membres |
| --- | --- | --- | --- | --- |
| Propriétaire | Oui | Oui | Oui | Oui |
| Administrateur | Oui | Oui | Oui | Non |
| Contributeur | Oui | Oui | Non | Non |
| Lecteur | Oui | Non | Non | Non |

Le partage donne accès à tout l'historique des analyses du projet, y compris les brouillons. Les anciens chats personnels et les autres fichiers de la bibliothèque restent privés. Les fichiers partagés restent dans leur collection vectorielle d'origine : la recherche interroge chaque propriétaire avec les seuls IDs autorisés puis entrelace les passages classés. Le classement est effectué par collection, sans reranking global supplémentaire.

Les permissions sont revérifiées avant les appels au modèle, à la reprise et avant le retour du résultat. La révocation ne peut pas rappeler une réponse déjà reçue ni annuler un appel fournisseur déjà lancé. Les documents ajoutés par un membre restent partagés après son retrait. Aucun endpoint de téléchargement partagé n'est ajouté : le parcours expose les métadonnées et les passages utilisés dans les analyses.

## Parcours

LangGraph orchestre : vérification des droits → recherche hybride et reranking existants → réponse structurée → vérification des citations et de leur pertinence → relecture facultative → réponse finale. Une recherche complémentaire et une correction sont possibles, dans la limite de deux recherches et deux générations. Faute de preuves suffisantes, le système s’abstient.

Les citations sont comparées aux passages récupérés. Un second appel au modèle évalue leur appui sémantique ; cette vérification ne garantit pas l’exactitude ni une protection complète contre les injections. Les documents sont traités comme des données non fiables.

## Validation humaine et accès

Les checkpoints PostgreSQL du schéma `aitheris_graph` permettent de reprendre une analyse après redémarrage. La table `rag_runs` contient le propriétaire, les documents et la décision. La validation porte sur l’empreinte exacte du brouillon ; une réindexation invalide l’analyse. Les droits sont contrôlés à la lecture, à la recherche et à la reprise. Un verrou PostgreSQL empêche les reprises concurrentes.

La validation est réservée au propriétaire du projet et à ses administrateurs ; l’identité réelle du validateur est enregistrée, même pour une analyse créée par un autre membre. Les nouvelles analyses sont limitées à 50 par compte sur 24 heures. Les reprises manuelles ne consomment pas une nouvelle analyse. Le délai global asynchrone est de 180 secondes ; une inférence locale bloquante peut dépasser ce délai.

## Mise en service

Utiliser l’environnement backend Python 3.11/3.12 du projet et installer `requirements.txt`. Appliquer `alembic upgrade head` depuis `backend`, avec la configuration de base habituelle, puis redémarrer le backend et reconstruire le frontend. Le démarrage initialise les tables de checkpoints. `/api/rag-workflows/capabilities` expose `ready` pour le compte authentifié. Les services Docker déjà lancés ne sont pas automatiquement mis à jour par une modification des fichiers.

PostgreSQL doit autoriser la création du schéma et de ses tables. Sur Windows natif, psycopg asynchrone exige une boucle Selector ; le déploiement Docker Linux évite cette contrainte. BGE-M3 sert aux embeddings et BGE-reranker-v2-m3 au classement ; voir `BGE_MODELS.md` pour la réindexation des anciens documents.

Les checkpoints conservent des questions et extraits documentaires : appliquer les mêmes règles de sauvegarde et de rétention qu’aux documents. Le downgrade conserve volontairement le schéma de checkpoints. Une purge administrative reste à implémenter.

## Vérifications

Les tests du graphe utilisent des réponses simulées et ne téléchargent aucun modèle :

```powershell
$env:PYTHONPATH='backend'
python -m unittest discover -s backend/tests -p test_rag_graph.py
```

Installer également `langgraph-checkpoint-sqlite==2.0.11` et `aiosqlite<0.22` pour le test de reprise sur disque. `test_rag_postgres.py` utilise `RAG_TEST_DATABASE_URL`, une URL SQLAlchemy `postgresql+psycopg://…` vers une base jetable exclusivement. Il crée des tables et teste les droits, la réindexation, les verrous et la reprise sur une nouvelle connexion. Ne jamais le lancer sur une base du projet.

Frontend : `npm test -- --watchAll=false --runInBand --testPathPattern=RagWorkflowsPage.test.jsx`, puis `npm run build`.

Dify, Knowledge Graph, Presidio et NeMo ne sont pas intégrés à ce parcours. Les tests simulés ne remplacent pas une évaluation avec le fournisseur LLM et les documents réels.
