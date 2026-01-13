namespace FactoryMonitoringWeb.Data.Repositories
{
    /// <summary>
    /// Generic repository interface for basic CRUD operations.
    /// 
    /// Design Decision: Generic interface because:
    /// 1. DRY - Common operations defined once
    /// 2. Enables generic decorators (logging, caching)
    /// 3. Interface Segregation - domain repos extend with specific methods
    /// 
    /// Pattern: Repository Pattern - Mediates between domain and data mapping layers
    /// using a collection-like interface for accessing domain objects.
    /// </summary>
    /// <typeparam name="TEntity">The entity type managed by this repository</typeparam>
    /// <typeparam name="TKey">The type of the entity's primary key</typeparam>
    public interface IRepository<TEntity, TKey> where TEntity : class
    {
        /// <summary>
        /// Gets an entity by its primary key.
        /// </summary>
        /// <param name="id">The primary key value</param>
        /// <param name="cancellationToken">Cancellation token</param>
        /// <returns>The entity if found, null otherwise</returns>
        Task<TEntity?> GetByIdAsync(TKey id, CancellationToken cancellationToken = default);

        /// <summary>
        /// Gets all entities of this type.
        /// Use with caution on large datasets - prefer filtered queries.
        /// </summary>
        /// <param name="cancellationToken">Cancellation token</param>
        /// <returns>All entities</returns>
        Task<IEnumerable<TEntity>> GetAllAsync(CancellationToken cancellationToken = default);

        /// <summary>
        /// Adds a new entity to the repository.
        /// </summary>
        /// <param name="entity">The entity to add</param>
        /// <param name="cancellationToken">Cancellation token</param>
        /// <returns>The added entity with any generated values (e.g., ID)</returns>
        Task<TEntity> AddAsync(TEntity entity, CancellationToken cancellationToken = default);

        /// <summary>
        /// Updates an existing entity.
        /// </summary>
        /// <param name="entity">The entity to update</param>
        /// <param name="cancellationToken">Cancellation token</param>
        Task UpdateAsync(TEntity entity, CancellationToken cancellationToken = default);

        /// <summary>
        /// Deletes an entity from the repository.
        /// </summary>
        /// <param name="entity">The entity to delete</param>
        /// <param name="cancellationToken">Cancellation token</param>
        Task DeleteAsync(TEntity entity, CancellationToken cancellationToken = default);

        /// <summary>
        /// Saves all pending changes to the underlying data store.
        /// </summary>
        /// <param name="cancellationToken">Cancellation token</param>
        /// <returns>Number of entities affected</returns>
        Task<int> SaveChangesAsync(CancellationToken cancellationToken = default);
    }

    /// <summary>
    /// Convenience interface for entities with integer primary keys.
    /// </summary>
    /// <typeparam name="TEntity">The entity type managed by this repository</typeparam>
    public interface IRepository<TEntity> : IRepository<TEntity, int> where TEntity : class
    {
    }
}
