namespace FactoryMonitoringWeb.Data.Repositories
{

    public interface IRepository<TEntity, TKey> where TEntity : class
    {

        Task<TEntity?> GetByIdAsync(TKey id, CancellationToken cancellationToken = default);

        Task<IEnumerable<TEntity>> GetAllAsync(CancellationToken cancellationToken = default);

        Task<TEntity> AddAsync(TEntity entity, CancellationToken cancellationToken = default);

        Task UpdateAsync(TEntity entity, CancellationToken cancellationToken = default);

        Task DeleteAsync(TEntity entity, CancellationToken cancellationToken = default);

        Task<int> SaveChangesAsync(CancellationToken cancellationToken = default);
    }

    public interface IRepository<TEntity> : IRepository<TEntity, int> where TEntity : class
    {
    }
}

