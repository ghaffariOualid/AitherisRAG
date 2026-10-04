# Modèles Aitheris

- Embeddings denses : `BAAI/bge-m3` (1024 dimensions).
- Reranking : `BAAI/bge-reranker-v2-m3`.
- La seconde étape de classement partage la même instance lorsque `CROSS_ENCODER_MODEL` et `RERANKER_MODEL` sont identiques. Elle évalue la pertinence, pas la véracité des réponses.
- La recherche lexicale BM25 existante reste en place. Les modes sparse et ColBERT natifs de BGE-M3 ne sont pas activés par ce changement.

## Activation

Reconstruire avec `docker compose -p ragio --env-file .env.local -f docker-compose.yml up -d --build`. Le service `model_init` vérifie les modèles en cache et télécharge les fichiers manquants avant le lancement du backend. Un échec de téléchargement bloque ce service explicitement. Le cache `huggingface_cache` est partagé entre la préparation, le backend et les workers et conservé lors des rebuilds. Le backend et les workers utilisent ensuite les modèles hors ligne. PyTorch 2.6 CPU permet le chargement des poids BGE au format PyTorch.

Suivre la préparation avec `docker compose -p ragio --env-file .env.local -f docker-compose.yml logs -f model_init`. Si le réseau a interrompu la préparation, corriger la connectivité puis relancer `up -d`. La vérification TLS reste activée.

Ces modèles sont plus volumineux que MiniLM et s'exécutent sur CPU dans la configuration actuelle. Le classement conserve la limite existante de 512 tokens par paire.

## Documents déjà indexés

Les index MiniLM sont conservés. Les nouveaux index portent un suffixe dérivé du modèle d'embeddings afin de ne pas mélanger les espaces vectoriels.

Les anciens documents doivent être réindexés avec BGE-M3 avant d'être utilisables dans le nouvel index. La route actuelle de traitement ignore les documents déjà terminés : un simple clic sur « traiter » ne suffit donc pas. Réimporter les fichiers crée des documents et des embeddings avec la nouvelle configuration ; une migration conservant les identifiants existants nécessite un traitement dédié. Aucune suppression ni migration des données existantes n'a été exécutée.

## Vérification locale sans téléchargement

Depuis la racine du projet :

```powershell
python -m unittest discover -s backend/tests -p test_bge_configuration.py
```
